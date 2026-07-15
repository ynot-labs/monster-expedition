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

    @Test func localizedStatusCopyCoversEveryPetState() {
        for state in PetState.allCases {
            #expect(!GameCopy.petStatus(state, locale: .english).isEmpty)
            #expect(!GameCopy.petStatus(state, locale: .simplifiedChinese).isEmpty)
        }
        #expect(GameCopy.monsterName("hammerpaw", locale: .simplifiedChinese) == "槌爪兽")
    }
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
