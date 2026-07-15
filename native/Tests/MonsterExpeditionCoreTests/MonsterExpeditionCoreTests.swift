#if canImport(Testing)
import Foundation
import Testing
@testable import MonsterExpeditionCore

@Suite(.serialized)
struct MonsterExpeditionCoreTests {
    @Test func snapshotPersistsAcrossStoreInstances() throws {
        let environment = try TestEnvironment()
        var snapshot = try environment.store.load()
        snapshot.gold = 77
        snapshot.preferences.locale = .simplifiedChinese
        try environment.store.replace(snapshot)

        let reopened = try SQLiteSnapshotStore(databaseURL: environment.databaseURL)
        let loaded = try reopened.load()
        #expect(loaded.gold == 77)
        #expect(loaded.preferences.locale == .simplifiedChinese)
    }

    @Test func syncAwardsAtMostTwoBondChargesAndIsIdempotent() throws {
        let environment = try TestEnvironment()
        let service = GameRPCService(store: environment.store)
        let request = requestData(
            id: "sync-1",
            method: "sync",
            params: ["newTokens": 350_000, "commandId": "command-1", "expectedRevision": 0]
        )

        let first = dictionary(service.handle(line: request))
        let firstSnapshot = nestedSnapshot(first)
        #expect(first["ok"] as? Bool == true)
        #expect(firstSnapshot["bondCharges"] as? Int == 2)
        #expect(firstSnapshot["tokenProgress"] as? Int == 0)
        #expect(firstSnapshot["petState"] as? String == "bond-ready")

        let replay = dictionary(service.handle(line: request))
        #expect(result(replay)["status"] as? String == "duplicate")
        #expect(nestedSnapshot(replay)["revision"] as? Int == 1)
    }

    @Test func staleRevisionIsRejectedWithoutMutation() throws {
        let environment = try TestEnvironment()
        let service = GameRPCService(store: environment.store)
        _ = service.handle(line: requestData(
            id: "prefs-1",
            method: "preferences",
            params: ["locale": "zh-CN", "commandId": "prefs-command", "expectedRevision": 0]
        ))

        let stale = dictionary(service.handle(line: requestData(
            id: "prefs-2",
            method: "preferences",
            params: ["muted": true, "commandId": "stale-command", "expectedRevision": 0]
        )))
        #expect(stale["ok"] as? Bool == false)
        #expect(stale["error"] as? String == "revision-conflict")
        #expect(try environment.store.load().preferences.muted == false)
    }

    @Test func unixSocketUsesOwnerOnlyPermissionsAndServesNewlineJSON() throws {
        let environment = try TestEnvironment()
        let service = GameRPCService(store: environment.store)
        let socketURL = environment.directory.appendingPathComponent("runtime.sock")
        let server = UnixRPCServer(socketURL: socketURL) { service.handle(line: $0) }
        try server.start()
        defer { server.stop() }

        let attributes = try FileManager.default.attributesOfItem(atPath: socketURL.path)
        let permissions = attributes[.posixPermissions] as? NSNumber
        #expect(permissions?.intValue == 0o600)

        let response = try UnixRPCClient.send(
            line: requestData(id: "snapshot", method: "snapshot", params: [:]),
            socketURL: socketURL
        )
        let decoded = dictionary(response)
        #expect(decoded["ok"] as? Bool == true)
        #expect((decoded["result"] as? [String: Any])?["leadMonsterID"] as? String == "hammerpaw")
    }

    @Test func mcpBridgeListsToolsAndServesWidget() throws {
        let environment = try TestEnvironment()
        let service = GameRPCService(store: environment.store)
        let bridge = MCPBridge(widgetHTML: "<html>pet</html>") { request in
            let response = service.handle(line: try JSONSerialization.data(withJSONObject: request))
            return dictionary(response)
        }

        let tools = dictionary(bridge.handle(line: requestData(
            id: 1,
            method: "tools/list",
            params: [:],
            jsonRPC: true
        ))!)
        let toolList = ((tools["result"] as? [String: Any])?["tools"] as? [[String: Any]]) ?? []
        #expect(toolList.count == 5)
        #expect(toolList.contains { $0["name"] as? String == "monster_expedition_open" })

        let resource = dictionary(bridge.handle(line: requestData(
            id: 2,
            method: "resources/read",
            params: ["uri": MCPBridge.widgetURI],
            jsonRPC: true
        ))!)
        let contents = ((resource["result"] as? [String: Any])?["contents"] as? [[String: Any]]) ?? []
        #expect(contents.first?["text"] as? String == "<html>pet</html>")
    }

    @Test func mcpBridgeReturnsConflictSnapshotForPanelRecovery() throws {
        let environment = try TestEnvironment()
        let service = GameRPCService(store: environment.store)
        _ = service.handle(line: requestData(
            id: "first",
            method: "preferences",
            params: ["locale": "zh-CN", "commandId": "first-command", "expectedRevision": 0]
        ))
        let bridge = MCPBridge(widgetHTML: "<html/>") { request in
            dictionary(service.handle(line: try JSONSerialization.data(withJSONObject: request)))
        }
        let conflict = dictionary(bridge.handle(line: requestData(
            id: 4,
            method: "tools/call",
            params: [
                "name": "monster_expedition_sync",
                "arguments": ["commandId": "stale", "expectedRevision": 0]
            ],
            jsonRPC: true
        ))!)
        let result = conflict["result"] as? [String: Any]
        #expect(result?["isError"] as? Bool == true)
        let structured = result?["structuredContent"] as? [String: Any]
        let snapshot = structured?["snapshot"] as? [String: Any]
        #expect(snapshot?["revision"] as? Int == 1)
    }

    @Test func localizedStatusCopyCoversEveryPetState() {
        for state in PetState.allCases {
            #expect(!GameCopy.petStatus(state, locale: .english).isEmpty)
            #expect(!GameCopy.petStatus(state, locale: .simplifiedChinese).isEmpty)
        }
        #expect(GameCopy.monsterName("hammerpaw", locale: .simplifiedChinese) == "槌爪兽")
    }

    @Test func nativeIdleSimulationAwardsProgressAndConsumesBurstOnElite() throws {
        let environment = try TestEnvironment()
        var snapshot = try environment.store.load()
        snapshot.bondCharges = 1
        snapshot.expeditionSeconds = 24 // wave five is the next completed wave
        try environment.store.replace(snapshot)
        let service = GameRPCService(store: environment.store)

        let response = dictionary(service.handle(line: requestData(
            id: "idle-1",
            method: "sync",
            params: ["elapsedSeconds": 12, "commandId": "idle-command", "expectedRevision": 0]
        )))
        let next = nestedSnapshot(response)
        #expect(next["expeditionSeconds"] as? Int == 36)
        #expect((next["trainerXP"] as? Int ?? 0) >= 12)
        #expect(next["bondCharges"] as? Int == 0)
        #expect(next["pendingRewards"] as? Int == 1)
    }

    @Test func codexLinkAddsOnlyItsMarkedLocalBlockAndRemovesIt() throws {
        let environment = try TestEnvironment()
        let configURL = environment.directory.appendingPathComponent("config.toml")
        try "[sandbox]\nmode = \"workspace-write\"\n".write(to: configURL, atomically: true, encoding: .utf8)
        let link = try CodexLinkManager(
            store: environment.store,
            dataDirectory: environment.directory,
            configURL: configURL,
            port: 42129
        )

        let authorized = try link.authorize()
        #expect(authorized.state == .restartRequired)
        let configured = try String(contentsOf: configURL, encoding: .utf8)
        #expect(configured.contains("# >>> Monster Expedition Codex Link >>>"))
        #expect(configured.contains("log_user_prompt = false"))
        #expect(configured.contains("127.0.0.1:42129"))
        #expect(configured.contains("[sandbox]"))

        let disconnected = try link.disconnect()
        #expect(disconnected.state == .notConfigured)
        let restored = try String(contentsOf: configURL, encoding: .utf8)
        #expect(!restored.contains("Monster Expedition Codex Link"))
        #expect(restored.contains("[sandbox]"))
    }

    @Test func codexLinkAcceptsOnlyResponseCompletedTokenTotals() throws {
        let environment = try TestEnvironment()
        let configURL = environment.directory.appendingPathComponent("config.toml")
        let link = try CodexLinkManager(
            store: environment.store,
            dataDirectory: environment.directory,
            configURL: configURL,
            port: 42130
        )
        defer { _ = try? link.disconnect() }
        _ = try link.authorize()
        let completedBody = "{\"type\":\"response.completed\",\"token_count\":{\"total_token_usage\":{\"total_tokens\":100000}}}"
        let record: [String: Any] = [
            "timeUnixNano": "123456",
            "attributes": [["key": "event.name", "value": ["stringValue": "codex.sse_event"]]],
            "body": ["stringValue": completedBody]
        ]
        let payload: [String: Any] = [
            "resourceLogs": [
                ["scopeLogs": [
                    ["logRecords": [record]]
                ]]
            ]
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)
        link.ingestOTLPJSON(data)
        let first = try environment.store.load()
        #expect(first.bondCharges == 1)
        #expect(first.workState == .completed)

        // Same timestamp/body is a retry and must not create another charge.
        link.ingestOTLPJSON(data)
        #expect(try environment.store.load().bondCharges == 1)
    }

    @Test func codexLinkReceivesTheLocalOTLPHTTPPayload() async throws {
        let environment = try TestEnvironment()
        let configURL = environment.directory.appendingPathComponent("config.toml")
        let link = try CodexLinkManager(
            store: environment.store,
            dataDirectory: environment.directory,
            configURL: configURL,
            port: 42131
        )
        defer { _ = try? link.disconnect() }
        _ = try link.authorize()
        let config = try String(contentsOf: configURL, encoding: .utf8)
        let prefix = "endpoint = \""
        guard let start = config.range(of: prefix) else { throw HTTPTestFailure("Missing local endpoint") }
        let endpoint = String(config[start.upperBound...].prefix { $0 != "\"" })
        let body = "{\"type\":\"response.completed\",\"token_count\":{\"total_token_usage\":{\"total_tokens\":100000}}}"
        let record: [String: Any] = [
            "timeUnixNano": "http-test",
            "attributes": [["key": "event.name", "value": ["stringValue": "codex.sse_event"]]],
            "body": ["stringValue": body]
        ]
        let payload: [String: Any] = [
            "resourceLogs": [
                ["scopeLogs": [
                    ["logRecords": [record]]
                ]]
            ]
        ]
        var request = URLRequest(url: try #require(URL(string: endpoint)))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let data = try JSONSerialization.data(withJSONObject: payload)
        let rawRequest = Data("POST /monster-expedition/\(endpoint.split(separator: "/").last!) HTTP/1.1\r\nContent-Length: \(data.count)\r\n\r\n".utf8) + data
        #expect(link.extractHTTPBody(from: rawRequest) == data)
        try await Task.sleep(for: .milliseconds(80))
        let (_, response) = try await URLSession.shared.upload(for: request, from: data)
        #expect((response as? HTTPURLResponse)?.statusCode == 200)
        #expect(try environment.store.load().bondCharges == 1)
    }
}

private struct HTTPTestFailure: Error, LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

private struct TestEnvironment {
    let directory: URL
    let databaseURL: URL
    let store: SQLiteSnapshotStore

    init() throws {
        directory = URL(fileURLWithPath: "/tmp", isDirectory: true)
            .appendingPathComponent("me-\(UUID().uuidString.prefix(8))", isDirectory: true)
        databaseURL = directory.appendingPathComponent("test.sqlite")
        store = try SQLiteSnapshotStore(databaseURL: databaseURL)
    }
}

private func requestData(
    id: Any,
    method: String,
    params: [String: Any],
    jsonRPC: Bool = false
) -> Data {
    var request: [String: Any] = ["id": id, "method": method, "params": params]
    if jsonRPC { request["jsonrpc"] = "2.0" }
    return try! JSONSerialization.data(withJSONObject: request, options: [.sortedKeys])
}

private func dictionary(_ data: Data) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
}

private func result(_ response: [String: Any]) -> [String: Any] {
    response["result"] as? [String: Any] ?? [:]
}

private func nestedSnapshot(_ response: [String: Any]) -> [String: Any] {
    result(response)["snapshot"] as? [String: Any] ?? [:]
}
#endif
