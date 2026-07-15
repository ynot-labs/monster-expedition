import CryptoKit
import Foundation
import Network
import Security

public protocol CodexLinkControlling: AnyObject {
    func authorize() throws -> CodexLinkStatus
    func disconnect() throws -> CodexLinkStatus
}

public struct CodexLinkStatus: Sendable {
    public let state: CodexLinkState
    public let restartRequired: Bool
    public let reason: String?
}

/// A local-only OpenTelemetry receiver.  It accepts numeric activity facts from
/// Codex and throws away all payload fields other than event type, success, and
/// `response.completed` token totals.  It never reads session files or stores
/// conversation content.
public final class CodexLinkManager: @unchecked Sendable, CodexLinkControlling {
    private static let beginMarker = "# >>> Monster Expedition Codex Link >>>"
    private static let endMarker = "# <<< Monster Expedition Codex Link <<<"
    private static let defaultPort: UInt16 = 42127
    private static let maxBodyBytes = 1_000_000

    private struct Metadata: Codable {
        let schemaVersion: Int
        let pathToken: String
        let hmacKey: String
        var hasReceivedEvent: Bool
    }

    private let store: SQLiteSnapshotStore
    private let dataDirectory: URL
    private let configURL: URL
    private let metadataURL: URL
    private let port: UInt16
    private let queue = DispatchQueue(label: "monster-expedition.codex-link", qos: .utility)
    private let lock = NSLock()
    private var listener: NWListener?
    private var metadata: Metadata?

    public init(
        store: SQLiteSnapshotStore,
        dataDirectory: URL? = nil,
        configURL: URL? = nil,
        port: UInt16 = 42127
    ) throws {
        self.store = store
        self.dataDirectory = dataDirectory ?? store.databaseURL.deletingLastPathComponent()
        self.configURL = configURL ?? FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex/config.toml")
        self.metadataURL = self.dataDirectory.appendingPathComponent("codex-link.json")
        self.port = port
        try FileManager.default.createDirectory(at: self.dataDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        metadata = try loadMetadata()
    }

    deinit { stopReceiver() }

    public func status() throws -> CodexLinkStatus {
        let source = try readConfig()
        let hasBegin = source.contains(Self.beginMarker)
        let hasEnd = source.contains(Self.endMarker)
        guard hasBegin == hasEnd else {
            return CodexLinkStatus(state: .configConflict, restartRequired: false, reason: "The Monster Expedition OTel block is incomplete.")
        }
        guard hasBegin else {
            let existingOTel = source.range(of: #"(?m)^\s*\[otel(?:[.\]])|^\s*exporter\s*="#, options: .regularExpression) != nil
            return CodexLinkStatus(
                state: existingOTel ? .configConflict : .notConfigured,
                restartRequired: false,
                reason: existingOTel ? "Codex already has OpenTelemetry configuration." : nil
            )
        }
        let received = metadata?.hasReceivedEvent == true
        return CodexLinkStatus(
            state: received ? .connected : .restartRequired,
            restartRequired: !received,
            reason: received ? nil : "Restart Codex once to begin local token counting."
        )
    }

    public func authorize() throws -> CodexLinkStatus {
        let current = try status()
        if current.state == .configConflict { return current }
        let next = try metadata ?? createMetadata()
        metadata = next
        try saveMetadata(next)

        let source = try readConfig()
        if !source.contains(Self.beginMarker) {
            let directory = configURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if !source.isEmpty {
                let stamp = Int(Date().timeIntervalSince1970)
                try writeSecure(source, to: configURL.appendingPathExtension("monster-expedition.\(stamp).bak"))
            }
            let divider = source.isEmpty || source.hasSuffix("\n") ? "" : "\n"
            try writeSecure("\(source)\(divider)\n\(managedBlock(metadata: next))", to: configURL)
        }
        try startReceiver()
        return CodexLinkStatus(state: .restartRequired, restartRequired: true, reason: "Restart Codex once to apply the local-only Link.")
    }

    public func disconnect() throws -> CodexLinkStatus {
        let source = try readConfig()
        if let start = source.range(of: Self.beginMarker), let end = source.range(of: Self.endMarker), start.lowerBound <= end.lowerBound {
            let after = end.upperBound
            let suffix = String(source[after...]).drop(while: { $0 == "\n" })
            let next = String(source[..<start.lowerBound]) + String(suffix)
            try writeSecure(next.trimmingCharacters(in: .newlines) + (next.trimmingCharacters(in: .newlines).isEmpty ? "" : "\n"), to: configURL)
        }
        stopReceiver()
        return CodexLinkStatus(state: .notConfigured, restartRequired: false, reason: nil)
    }

    public func startIfConfigured() throws {
        let current = try status()
        if current.state == .restartRequired || current.state == .connected { try startReceiver() }
    }

    public func startReceiver() throws {
        lock.lock()
        if listener != nil { lock.unlock(); return }
        lock.unlock()
        guard metadata != nil else { return }

        let listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
        listener.newConnectionHandler = { [weak self] connection in self?.receive(connection, buffer: Data()) }
        listener.start(queue: queue)
        lock.lock()
        self.listener = listener
        lock.unlock()
    }

    public func stopReceiver() {
        lock.lock()
        let current = listener
        listener = nil
        lock.unlock()
        current?.cancel()
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: Self.maxBodyBytes + 8_192) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var next = buffer
            if let data { next.append(data) }
            if next.count > Self.maxBodyBytes + 8_192 {
                self.reply(connection, status: 413)
                return
            }
            if let body = self.extractHTTPBody(from: next) {
                self.ingestOTLPJSON(body)
                self.reply(connection, status: 200)
            } else if complete || error != nil {
                self.reply(connection, status: 400)
            } else {
                self.receive(connection, buffer: next)
            }
        }
    }

    private func reply(_ connection: NWConnection, status: Int) {
        let label = status == 200 ? "OK" : status == 413 ? "Payload Too Large" : "Bad Request"
        let response = Data("HTTP/1.1 \(status) \(label)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    /// Internal test seam for the strict local HTTP framing parser.
    func extractHTTPBody(from request: Data) -> Data? {
        let separator = Data([0x0D, 0x0A, 0x0D, 0x0A])
        guard let headerRange = request.range(of: separator), let metadata,
              let head = String(data: request.subdata(in: request.startIndex..<headerRange.lowerBound), encoding: .utf8) else {
            return nil
        }
        let lines = head.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else { return Data() }
        let parts = requestLine.split(separator: " ")
        let expectedPath = "/monster-expedition/\(metadata.pathToken)"
        guard parts.count >= 3, parts[0] == "POST", parts[1] == Substring(expectedPath) else { return Data() }
        let contentLength = lines.dropFirst().compactMap { line -> Int? in
            guard let colon = line.firstIndex(of: ":") else { return nil }
            let key = line[..<colon].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard key == "content-length" else { return nil }
            return Int(line[line.index(after: colon)...].trimmingCharacters(in: .whitespacesAndNewlines))
        }.first ?? 0
        guard contentLength > 0, contentLength <= Self.maxBodyBytes else { return Data() }
        let bodyStart = headerRange.upperBound
        guard request.distance(from: bodyStart, to: request.endIndex) >= contentLength else { return nil }
        let bodyEnd = request.index(bodyStart, offsetBy: contentLength)
        return request.subdata(in: bodyStart..<bodyEnd)
    }

    /// Internal seam for deterministic tests. The public receiver is still the
    /// loopback-only HTTP listener; this method never retains raw payload data.
    func ingestOTLPJSON(_ body: Data) {
        guard let payload = try? JSONSerialization.jsonObject(with: body),
              let records = logRecords(payload) else { return }
        for record in records { process(record: record) }
    }

    private func process(record: [String: Any]) {
        let flattened = flatten(record)
        let envelope = ["event.name", "event", "event.kind"].compactMap { flattened[$0] as? String }.first
        let bodyType = ["type", "event.type", "event_name"].compactMap { flattened[$0] as? String }.first
        let name = bodyType ?? envelope
        guard let name else { return }
        // Token totals are gameplay input only in this exact, documented shape.
        // Any unknown event or schema becomes a harmless no-op.
        let isCompletedResponse = envelope == "codex.sse_event" && bodyType == "response.completed"
        let success = flattened["success"] as? Bool
        let state: WorkState?
        switch envelope ?? name {
        case "codex.conversation_starts", "codex.api_request", "codex.sse_event": state = success == false ? .failed : .responding
        case "codex.tool_decision": state = .awaitingApproval
        case "codex.tool_result": state = success == false ? .failed : .toolRunning
        default: state = nil
        }
        let total = isCompletedResponse ? ["total_token_usage.total_tokens", "token_count.total_token_usage.total_tokens", "total_tokens"]
            .compactMap { number(flattened[$0]) }
            .first : nil
        let eventID = eventFingerprint(record: record, total: total ?? 0, name: name)

        _ = try? store.mutate(commandID: eventID, expectedRevision: nil) { snapshot in
            if isCompletedResponse, let total, total > 0 {
                var progress = snapshot.tokenProgress + total
                while progress >= GameSnapshot.tokenThreshold, snapshot.bondCharges < GameSnapshot.maximumBondCharges {
                    progress -= GameSnapshot.tokenThreshold
                    snapshot.bondCharges += 1
                    snapshot.petState = .bondReady
                }
                snapshot.tokenProgress = snapshot.bondCharges == GameSnapshot.maximumBondCharges ? 0 : progress
                snapshot.workState = .completed
            } else if let state {
                snapshot.workState = state
            }
            snapshot.workUpdatedAt = Date()
            snapshot.codexLinkState = .connected
        }
        if var metadata {
            metadata.hasReceivedEvent = true
            self.metadata = metadata
            try? saveMetadata(metadata)
        }
    }

    private func logRecords(_ payload: Any) -> [[String: Any]]? {
        guard let root = payload as? [String: Any], let resourceLogs = root["resourceLogs"] as? [[String: Any]] else { return nil }
        return resourceLogs.flatMap { resource in
            (resource["scopeLogs"] as? [[String: Any]] ?? []).flatMap { scope in scope["logRecords"] as? [[String: Any]] ?? [] }
        }
    }

    private func flatten(_ record: [String: Any]) -> [String: Any] {
        var output: [String: Any] = [:]
        for attribute in record["attributes"] as? [[String: Any]] ?? [] {
            guard let key = attribute["key"] as? String else { continue }
            output[key] = otelScalar(attribute["value"])
        }
        if let body = record["body"] as? [String: Any], let string = body["stringValue"] as? String,
           let parsedAny = try? JSONSerialization.jsonObject(with: Data(string.utf8)),
           let parsed = parsedAny as? [String: Any] {
            flattenObject(parsed, into: &output)
        }
        return output
    }

    private func flattenObject(_ value: [String: Any], prefix: String = "", into output: inout [String: Any]) {
        for (key, nested) in value {
            let name = prefix.isEmpty ? key : "\(prefix).\(key)"
            if let nested = nested as? [String: Any] { flattenObject(nested, prefix: name, into: &output) }
            else { output[name] = otelScalar(nested) }
        }
    }

    private func otelScalar(_ value: Any?) -> Any? {
        guard let value = value as? [String: Any] else { return value }
        if let value = value["stringValue"] { return value }
        if let string = value["intValue"] as? String { return Int(string) }
        if let number = value["intValue"] as? NSNumber { return number.intValue }
        if let value = value["doubleValue"] { return value }
        if let value = value["boolValue"] { return value }
        return value
    }

    private func number(_ value: Any?) -> Int? {
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String { return Int(string) }
        return nil
    }

    private func eventFingerprint(record: [String: Any], total: Int, name: String) -> String {
        let stamp = record["timeUnixNano"] ?? record["observedTimeUnixNano"] ?? ""
        let source = "\(stamp)|\(total)|\(name)"
        let key = SymmetricKey(data: Data((metadata?.hmacKey ?? "fallback").utf8))
        let digest = HMAC<SHA256>.authenticationCode(for: Data(source.utf8), using: key)
        return "otel:" + digest.map { String(format: "%02x", $0) }.joined()
    }

    private func createMetadata() throws -> Metadata {
        let token = try randomHex(bytes: 18)
        return Metadata(schemaVersion: 1, pathToken: token, hmacKey: try randomHex(bytes: 32), hasReceivedEvent: false)
    }

    private func randomHex(bytes: Int) throws -> String {
        var data = [UInt8](repeating: 0, count: bytes)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes, &data) == errSecSuccess else { throw CodexLinkError.randomFailure }
        return data.map { String(format: "%02x", $0) }.joined()
    }

    private func endpoint(metadata: Metadata) -> String { "http://127.0.0.1:\(port)/monster-expedition/\(metadata.pathToken)" }

    private func managedBlock(metadata: Metadata) -> String {
        [
            Self.beginMarker,
            "# Local gameplay input only. No prompt content is enabled or stored.",
            "[otel]",
            "environment = \"monster-expedition\"",
            "log_user_prompt = false",
            "exporter = { otlp-http = { endpoint = \"\(endpoint(metadata: metadata))\", protocol = \"json\" } }",
            Self.endMarker,
            ""
        ].joined(separator: "\n")
    }

    private func readConfig() throws -> String {
        guard FileManager.default.fileExists(atPath: configURL.path) else { return "" }
        return try String(contentsOf: configURL, encoding: .utf8)
    }

    private func loadMetadata() throws -> Metadata? {
        guard FileManager.default.fileExists(atPath: metadataURL.path) else { return nil }
        return try SnapshotCoding.decoder().decode(Metadata.self, from: Data(contentsOf: metadataURL))
    }

    private func saveMetadata(_ metadata: Metadata) throws {
        try writeSecure(String(decoding: try SnapshotCoding.encoder(prettyPrinted: true).encode(metadata), as: UTF8.self), to: metadataURL)
    }

    private func writeSecure(_ string: String, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try Data(string.utf8).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

public enum CodexLinkError: Error, LocalizedError {
    case randomFailure
    public var errorDescription: String? { "Could not create local Codex Link credentials." }
}
