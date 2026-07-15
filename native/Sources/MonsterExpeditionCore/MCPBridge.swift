import Foundation

/// Minimal newline-delimited MCP/JSON-RPC bridge. The production helper uses this
/// in `--mcp-stdio` mode and forwards game mutations to the GUI-owned Unix socket.
public final class MCPBridge: @unchecked Sendable {
    public static let widgetURI = "ui://monster-expedition/widget.html"

    private let widgetHTML: String
    private let rpcTransport: ([String: Any]) throws -> [String: Any]

    public init(
        widgetHTML: String,
        rpcTransport: @escaping ([String: Any]) throws -> [String: Any]
    ) {
        self.widgetHTML = widgetHTML
        self.rpcTransport = rpcTransport
    }

    public func handle(line: Data) -> Data? {
        do {
            guard let request = try JSONSerialization.jsonObject(with: line) as? [String: Any],
                  let method = request["method"] as? String else {
                return jsonRPCError(id: nil, code: -32600, message: "Invalid Request")
            }
            let id = request["id"]
            if id == nil, method.hasPrefix("notifications/") { return nil }
            let params = request["params"] as? [String: Any] ?? [:]

            switch method {
            case "initialize":
                return jsonRPCResult(id: id, result: [
                    "protocolVersion": "2025-06-18",
                    "capabilities": ["tools": ["listChanged": false], "resources": ["listChanged": false]],
                    "serverInfo": ["name": "monster-expedition", "version": "0.1.0"],
                    "instructions": "Open and manage the local Monster Expedition companion."
                ])
            case "ping":
                return jsonRPCResult(id: id, result: [:])
            case "tools/list":
                return jsonRPCResult(id: id, result: ["tools": toolDefinitions()])
            case "tools/call":
                return handleToolCall(id: id, params: params)
            case "resources/list":
                return jsonRPCResult(id: id, result: ["resources": [[
                    "uri": Self.widgetURI,
                    "name": "Monster Expedition",
                    "description": "The local expedition management panel.",
                    "mimeType": "text/html;profile=mcp-app"
                ]]])
            case "resources/read":
                guard params["uri"] as? String == Self.widgetURI else {
                    return jsonRPCError(id: id, code: -32002, message: "Resource not found")
                }
                return jsonRPCResult(id: id, result: ["contents": [[
                    "uri": Self.widgetURI,
                    "mimeType": "text/html;profile=mcp-app",
                    "text": widgetHTML,
                    "_meta": [
                        "ui": ["prefersBorder": false],
                        "openai/widgetPrefersBorder": false
                    ]
                ]]])
            case "resources/templates/list":
                return jsonRPCResult(id: id, result: ["resourceTemplates": []])
            default:
                return jsonRPCError(id: id, code: -32601, message: "Method not found")
            }
        } catch {
            return jsonRPCError(id: nil, code: -32603, message: error.localizedDescription)
        }
    }

    private func handleToolCall(id: Any?, params: [String: Any]) -> Data {
        guard let name = params["name"] as? String,
              supportedTools.contains(name) else {
            return jsonRPCError(id: id, code: -32602, message: "Unknown tool")
        }
        let arguments = params["arguments"] as? [String: Any] ?? [:]
        do {
            let response = try rpcTransport([
                "id": UUID().uuidString,
                "method": name,
                "params": arguments
            ])
            let ok = response["ok"] as? Bool ?? false
            if ok {
                let result = response["result"] ?? [:]
                let text = prettyJSONString(result)
                let snapshot = (result as? [String: Any])?["snapshot"] ?? result
                return jsonRPCResult(id: id, result: [
                    "content": [["type": "text", "text": text]],
                    "structuredContent": ["snapshot": snapshot],
                    "isError": false,
                    "_meta": [
                        "ui/resourceUri": Self.widgetURI,
                        "openai/outputTemplate": Self.widgetURI
                    ]
                ])
            }
            let message = response["message"] as? String ?? response["error"] as? String ?? "Local helper error"
            var structured: [String: Any] = ["error": response["error"] ?? "helper-error"]
            if let snapshot = response["snapshot"] { structured["snapshot"] = snapshot }
            return jsonRPCResult(id: id, result: [
                "content": [["type": "text", "text": message]],
                "structuredContent": structured,
                "isError": true
            ])
        } catch {
            return jsonRPCResult(id: id, result: [
                "content": [["type": "text", "text": "Monster Expedition helper is unavailable: \(error.localizedDescription)"]],
                "structuredContent": ["error": "helper-unavailable"],
                "isError": true
            ])
        }
    }

    private var supportedTools: Set<String> {
        [
            "monster_expedition_open",
            "monster_expedition_sync",
            "monster_expedition_act",
            "monster_expedition_preferences",
            "monster_expedition_export_diagnostics"
        ]
    }

    private func toolDefinitions() -> [[String: Any]] {
        let commonMeta: [String: Any] = [
            "ui/resourceUri": Self.widgetURI,
            "openai/outputTemplate": Self.widgetURI
        ]
        return [
            [
                "name": "monster_expedition_open",
                "description": "Open Monster Expedition and return its current local snapshot.",
                "inputSchema": objectSchema(properties: [:]),
                "_meta": commonMeta
            ],
            [
                "name": "monster_expedition_sync",
                "description": "Apply local Codex token and idle-time progress.",
                "inputSchema": objectSchema(properties: [
                    "newTokens": ["type": "integer", "minimum": 0],
                    "elapsedSeconds": ["type": "integer", "minimum": 0],
                    "commandId": ["type": "string"],
                    "expectedRevision": ["type": "integer", "minimum": 0]
                ]),
                "_meta": commonMeta
            ],
            [
                "name": "monster_expedition_act",
                "description": "Perform one explicit game action.",
                "inputSchema": objectSchema(properties: [
                    "commandId": ["type": "string"],
                    "expectedRevision": ["type": "integer", "minimum": 0],
                    "action": ["type": "object", "additionalProperties": true]
                ]),
                "_meta": commonMeta
            ],
            [
                "name": "monster_expedition_preferences",
                "description": "Update language, sound, or reduced-motion preferences.",
                "inputSchema": objectSchema(properties: [
                    "locale": ["type": "string", "enum": ["en", "zh-CN"]],
                    "reducedMotion": ["type": "boolean"],
                    "muted": ["type": "boolean"],
                    "commandId": ["type": "string"],
                    "expectedRevision": ["type": "integer", "minimum": 0]
                ]),
                "_meta": commonMeta
            ],
            [
                "name": "monster_expedition_export_diagnostics",
                "description": "Return a local diagnostic summary without conversation content.",
                "inputSchema": objectSchema(properties: [:]),
                "_meta": commonMeta
            ]
        ]
    }

    private func objectSchema(properties: [String: Any]) -> [String: Any] {
        ["type": "object", "properties": properties, "additionalProperties": false]
    }

    private func jsonRPCResult(id: Any?, result: Any) -> Data {
        encode(["jsonrpc": "2.0", "id": id ?? NSNull(), "result": result])
    }

    private func jsonRPCError(id: Any?, code: Int, message: String) -> Data {
        encode([
            "jsonrpc": "2.0",
            "id": id ?? NSNull(),
            "error": ["code": code, "message": message]
        ])
    }

    private func encode(_ object: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ??
            Data("{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"Encoding error\"}}".utf8)
    }

    private func prettyJSONString(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]) else {
            return String(describing: value)
        }
        return String(decoding: data, as: UTF8.self)
    }
}
