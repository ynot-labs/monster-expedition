import AppKit
import Foundation
import MonsterExpeditionCore

private func writeLine(_ data: Data) {
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

private func widgetHTML() -> String {
    let candidates = [
        Bundle.module.url(forResource: "monster-expedition-widget", withExtension: "html", subdirectory: "Resources"),
        Bundle.module.url(forResource: "monster-expedition-widget", withExtension: "html"),
        Bundle.main.resourceURL?.appendingPathComponent("widget/index.html")
    ].compactMap { $0 }
    for url in candidates {
        if let html = try? String(contentsOf: url, encoding: .utf8) { return html }
    }
    return "<!doctype html><html><body><h1>Monster Expedition</h1></body></html>"
}

private func launchGUIAppIfBundled() {
    if ProcessInfo.processInfo.environment["MONSTER_EXPEDITION_DISABLE_GUI_LAUNCH"] == "1" { return }
    let bundleURL = Bundle.main.bundleURL
    guard bundleURL.pathExtension == "app" else { return }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-g", bundleURL.path]
    try? process.run()
}

private func makeTransport(
    store: SQLiteSnapshotStore,
    capability: String
) throws -> (([String: Any]) throws -> [String: Any]) {
    let codexLink = try CodexLinkManager(store: store)
    try codexLink.startIfConfigured()
    let service = GameRPCService(store: store, requiredCapabilityKey: capability, codexLink: codexLink)
    let socketURL = store.databaseURL.deletingLastPathComponent().appendingPathComponent("runtime.sock")
    var didAttemptLaunch = false
    return { original in
        var request = original
        request["auth"] = capability
        let encoded = try JSONSerialization.data(withJSONObject: request, options: [.sortedKeys])
        do {
            let response = try UnixRPCClient.send(line: encoded, socketURL: socketURL)
            return try decodeDictionary(response)
        } catch {
            if !didAttemptLaunch {
                didAttemptLaunch = true
                launchGUIAppIfBundled()
                for _ in 0..<12 {
                    usleep(100_000)
                    if let response = try? UnixRPCClient.send(line: encoded, socketURL: socketURL),
                       let decoded = try? decodeDictionary(response) {
                        return decoded
                    }
                }
            }
            // Development and recovery fallback: SQLite remains transactional and the
            // GUI will observe this revision when it becomes available.
            return try decodeDictionary(service.handle(line: encoded))
        }
    }
}

private func decodeDictionary(_ data: Data) throws -> [String: Any] {
    guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw UnixRPCError.noResponse
    }
    return value
}

private func runRawRPCStdio(transport: ([String: Any]) throws -> [String: Any]) {
    while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8),
              let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            writeLine(Data("{\"ok\":false,\"error\":\"invalid-request\"}".utf8))
            continue
        }
        do {
            let response = try transport(request)
            writeLine(try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]))
        } catch {
            let response: [String: Any] = ["ok": false, "error": "helper-unavailable", "message": error.localizedDescription]
            writeLine((try? JSONSerialization.data(withJSONObject: response, options: [.sortedKeys])) ?? Data())
        }
    }
}

private func runMCPStdio(transport: @escaping ([String: Any]) throws -> [String: Any]) {
    let bridge = MCPBridge(widgetHTML: widgetHTML(), rpcTransport: transport)
    while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8) else { continue }
        if let response = bridge.handle(line: data) { writeLine(response) }
    }
}

let arguments = Set(CommandLine.arguments.dropFirst())
if arguments.contains("--mcp-stdio") || arguments.contains("--rpc-stdio") || arguments.contains("--print-snapshot") {
    do {
        let store = try SQLiteSnapshotStore()
        let capability = try CapabilityKeyStore.getOrCreate()
        let transport = try makeTransport(store: store, capability: capability)
        if arguments.contains("--mcp-stdio") {
            runMCPStdio(transport: transport)
        } else if arguments.contains("--rpc-stdio") {
            runRawRPCStdio(transport: transport)
        } else {
            let data = try SnapshotCoding.encoder(prettyPrinted: true).encode(store.load())
            writeLine(data)
        }
    } catch {
        fputs("Monster Expedition CLI failed: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
} else {
    // Command-line entry points execute on the process main thread. Declare that
    // fact at the AppKit boundary so Swift 6's actor isolation is preserved while
    // the package remains buildable on GitHub's Swift 5.10 macOS image.
    MainActor.assumeIsolated {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        application.run()
    }
}
