import AppKit
import MonsterExpeditionCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var store: SQLiteSnapshotStore?
    private var rpcServer: UnixRPCServer?
    private var petWindowController: PetWindowController?
    private var pollTimer: Timer?
    private var lastRenderedRevision = -1
    private var lastBridgeUpdate: Date?

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            NSApp.setActivationPolicy(.accessory)
            let store = try SQLiteSnapshotStore()
            let capability = try CapabilityKeyStore.getOrCreate()
            let service = GameRPCService(store: store, requiredCapabilityKey: capability)
            let runtimeURL = store.databaseURL.deletingLastPathComponent().appendingPathComponent("runtime.sock")
            let server = UnixRPCServer(socketURL: runtimeURL) { service.handle(line: $0) }
            try server.start()

            let snapshot: GameSnapshot
            if let bridge = PetBridgeSnapshot.load() {
                snapshot = bridge.gameSnapshot()
                lastBridgeUpdate = bridge.updatedAt
            } else {
                snapshot = try store.load()
            }
            let controller = PetWindowController(initialSnapshot: snapshot)
            controller.show()

            self.store = store
            self.rpcServer = server
            self.petWindowController = controller
            lastRenderedRevision = snapshot.revision
            pollTimer = Timer.scheduledTimer(timeInterval: 0.35, target: self, selector: #selector(pollSnapshot), userInfo: nil, repeats: true)

            NSWorkspace.shared.notificationCenter.addObserver(
                self,
                selector: #selector(accessibilityDisplayOptionsChanged),
                name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
                object: nil
            )
        } catch {
            fputs("Monster Expedition helper failed to start: \(error.localizedDescription)\n", stderr)
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        pollTimer?.invalidate()
        petWindowController?.savePosition()
        rpcServer?.stop()
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    @objc private func pollSnapshot() {
        if let bridge = PetBridgeSnapshot.load(), bridge.updatedAt != lastBridgeUpdate {
            lastBridgeUpdate = bridge.updatedAt
            lastRenderedRevision = bridge.revision
            petWindowController?.render(bridge.gameSnapshot())
            return
        }
        guard let store, let snapshot = try? store.load() else { return }
        guard snapshot.revision != lastRenderedRevision else { return }
        lastRenderedRevision = snapshot.revision
        petWindowController?.render(snapshot)
    }

    @objc private func accessibilityDisplayOptionsChanged() {
        guard let store, let snapshot = try? store.load() else { return }
        petWindowController?.render(snapshot)
    }
}
