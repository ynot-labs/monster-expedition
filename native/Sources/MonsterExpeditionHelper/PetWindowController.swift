import AppKit
import MonsterExpeditionCore
import SpriteKit

@MainActor
final class PetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class DraggablePetView: SKView {
    private var dragStartMouse = CGPoint.zero
    private var dragStartOrigin = CGPoint.zero

    override var acceptsFirstResponder: Bool { false }

    override func mouseDown(with event: NSEvent) {
        dragStartMouse = NSEvent.mouseLocation
        dragStartOrigin = window?.frame.origin ?? .zero
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window else { return }
        let current = NSEvent.mouseLocation
        let proposed = CGPoint(
            x: dragStartOrigin.x + current.x - dragStartMouse.x,
            y: dragStartOrigin.y + current.y - dragStartMouse.y
        )
        window.setFrameOrigin(clampedOrigin(proposed, windowSize: window.frame.size))
    }

    override func rightMouseDown(with event: NSEvent) {
        let menu = NSMenu(title: "Monster Expedition")
        let quit = NSMenuItem(title: "Quit Monster Expedition", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.target = NSApp
        menu.addItem(quit)
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }

    private func clampedOrigin(_ proposed: CGPoint, windowSize: CGSize) -> CGPoint {
        let proposedFrame = CGRect(origin: proposed, size: windowSize)
        let screen = NSScreen.screens.max { lhs, rhs in
            lhs.visibleFrame.intersection(proposedFrame).area < rhs.visibleFrame.intersection(proposedFrame).area
        } ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return proposed }
        return CGPoint(
            x: min(max(proposed.x, visible.minX - windowSize.width + 72), visible.maxX - 72),
            y: min(max(proposed.y, visible.minY), visible.maxY - 72)
        )
    }
}

@MainActor
final class PetWindowController: NSWindowController {
    let petScene: PetScene

    init(initialSnapshot: GameSnapshot) {
        let size = CGSize(width: 280, height: 220)
        let panel = PetPanel(
            contentRect: CGRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.animationBehavior = .none
        panel.title = "Monster Expedition"

        let view = DraggablePetView(frame: CGRect(origin: .zero, size: size))
        view.allowsTransparency = true
        view.ignoresSiblingOrder = true
        view.preferredFramesPerSecond = 30
        view.shouldCullNonVisibleNodes = true
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.clear.cgColor
        panel.contentView = view

        petScene = PetScene(size: size)
        view.presentScene(petScene)
        super.init(window: panel)

        let savedOrigin = UserDefaults.standard.string(forKey: "petWindowOrigin")
            .flatMap(Self.point(from:))
        if let savedOrigin {
            panel.setFrameOrigin(savedOrigin)
        } else if let screen = NSScreen.main {
            panel.setFrameOrigin(CGPoint(
                x: screen.visibleFrame.maxX - size.width - 28,
                y: screen.visibleFrame.minY + 54
            ))
        }
        render(initialSnapshot)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func show() {
        window?.orderFrontRegardless()
    }

    func render(_ snapshot: GameSnapshot) {
        let systemReducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        petScene.render(snapshot: snapshot, systemReducedMotion: systemReducedMotion)
        if let view = window?.contentView as? SKView {
            view.preferredFramesPerSecond = snapshot.petState == .traveling ? 24 : 30
            view.isPaused = false
        }
    }

    func savePosition() {
        guard let origin = window?.frame.origin else { return }
        UserDefaults.standard.set(Self.string(from: origin), forKey: "petWindowOrigin")
    }

    private static func string(from point: CGPoint) -> String { "\(point.x),\(point.y)" }

    private static func point(from string: String) -> CGPoint? {
        let values = string.split(separator: ",").compactMap { Double($0) }
        guard values.count == 2 else { return nil }
        return CGPoint(x: values[0], y: values[1])
    }
}

private extension CGRect {
    var area: CGFloat { isNull ? 0 : width * height }
}
