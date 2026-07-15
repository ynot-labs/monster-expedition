import AppKit
import MonsterExpeditionCore
import SpriteKit

@MainActor
final class PetScene: SKScene {
    private var renderedSignature = ""

    override init(size: CGSize) {
        super.init(size: size)
        scaleMode = .resizeFill
        backgroundColor = .clear
        anchorPoint = CGPoint(x: 0.5, y: 0.5)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    func render(snapshot: GameSnapshot, systemReducedMotion: Bool) {
        let reducedMotion = snapshot.preferences.reducedMotion || systemReducedMotion
        let signature = [
            String(snapshot.revision), snapshot.petState.rawValue,
            snapshot.leadMonsterID, snapshot.preferences.locale.rawValue,
            String(reducedMotion)
        ].joined(separator: ":")
        guard signature != renderedSignature else { return }
        renderedSignature = signature
        removeAllActions()
        removeAllChildren()

        let art = makeLeadMonster(snapshot.leadMonsterID)
        art.position = CGPoint(x: 0, y: -2)
        addChild(art)

        addStatusLabel(snapshot: snapshot)
        addBondCharm(to: art, snapshot: snapshot, reducedMotion: reducedMotion)
        decorate(state: snapshot.petState, art: art, reducedMotion: reducedMotion)
    }

    private func addStatusLabel(snapshot: GameSnapshot) {
        let bubble = SKShapeNode(rectOf: CGSize(width: 232, height: 32), cornerRadius: 16)
        bubble.position = CGPoint(x: 0, y: 88)
        bubble.fillColor = NSColor(calibratedWhite: 0.99, alpha: 0.94)
        bubble.strokeColor = NSColor(calibratedRed: 0.20, green: 0.16, blue: 0.12, alpha: 0.85)
        bubble.lineWidth = 2
        bubble.zPosition = 30
        addChild(bubble)

        let label = SKLabelNode(fontNamed: "Avenir Next Demi Bold")
        label.text = GameCopy.petStatus(snapshot.petState, locale: snapshot.preferences.locale)
        label.fontSize = snapshot.preferences.locale == .english ? 13 : 14
        label.fontColor = NSColor(calibratedRed: 0.18, green: 0.14, blue: 0.10, alpha: 1)
        label.verticalAlignmentMode = .center
        label.horizontalAlignmentMode = .center
        bubble.addChild(label)
    }

    private func makeHammerpaw() -> SKNode {
        let root = SKNode()
        root.name = "hammerpaw"

        let shadow = SKShapeNode(ellipseOf: CGSize(width: 128, height: 24))
        shadow.position = CGPoint(x: 0, y: -72)
        shadow.fillColor = NSColor(calibratedWhite: 0.12, alpha: 0.18)
        shadow.strokeColor = .clear
        shadow.zPosition = -5
        root.addChild(shadow)

        let tail = SKShapeNode(path: tailPath())
        style(tail, fill: color(0xC77A38), lineWidth: 5)
        tail.position = CGPoint(x: 62, y: -18)
        tail.zPosition = 0
        root.addChild(tail)

        let body = SKShapeNode(ellipseOf: CGSize(width: 122, height: 112))
        style(body, fill: color(0xD99146), lineWidth: 6)
        body.position = CGPoint(x: 0, y: -17)
        body.zPosition = 2
        root.addChild(body)

        let belly = SKShapeNode(ellipseOf: CGSize(width: 72, height: 74))
        belly.fillColor = color(0xF3C77E)
        belly.strokeColor = .clear
        belly.position = CGPoint(x: 0, y: -27)
        belly.zPosition = 3
        root.addChild(belly)

        for x in [-43.0, 43.0] {
            let leg = SKShapeNode(ellipseOf: CGSize(width: 46, height: 34))
            style(leg, fill: color(0xE4A65C), lineWidth: 5)
            leg.position = CGPoint(x: x, y: -65)
            leg.zPosition = 4
            root.addChild(leg)
        }

        let leftEar = SKShapeNode(path: earPath(mirrored: false))
        style(leftEar, fill: color(0xB86736), lineWidth: 6)
        leftEar.position = CGPoint(x: -41, y: 52)
        leftEar.zPosition = 1
        root.addChild(leftEar)

        let rightEar = SKShapeNode(path: earPath(mirrored: true))
        style(rightEar, fill: color(0xB86736), lineWidth: 6)
        rightEar.position = CGPoint(x: 41, y: 52)
        rightEar.zPosition = 1
        root.addChild(rightEar)

        let head = SKShapeNode(ellipseOf: CGSize(width: 120, height: 104))
        style(head, fill: color(0xE4A052), lineWidth: 6)
        head.position = CGPoint(x: 0, y: 27)
        head.zPosition = 5
        root.addChild(head)

        let muzzle = SKShapeNode(ellipseOf: CGSize(width: 68, height: 46))
        muzzle.fillColor = color(0xF7D495)
        muzzle.strokeColor = .clear
        muzzle.position = CGPoint(x: 0, y: 10)
        muzzle.zPosition = 6
        root.addChild(muzzle)

        for x in [-25.0, 25.0] {
            let eye = SKShapeNode(ellipseOf: CGSize(width: 13, height: 18))
            eye.fillColor = color(0x30251F)
            eye.strokeColor = .clear
            eye.position = CGPoint(x: x, y: 34)
            eye.zPosition = 7
            root.addChild(eye)
            let glint = SKShapeNode(circleOfRadius: 2.5)
            glint.fillColor = .white
            glint.strokeColor = .clear
            glint.position = CGPoint(x: -2, y: 4)
            eye.addChild(glint)
        }

        let nose = SKShapeNode(ellipseOf: CGSize(width: 17, height: 12))
        nose.fillColor = color(0x4C3429)
        nose.strokeColor = .clear
        nose.position = CGPoint(x: 0, y: 17)
        nose.zPosition = 8
        root.addChild(nose)

        let smile = SKShapeNode(path: smilePath())
        smile.strokeColor = color(0x654130)
        smile.lineWidth = 3
        smile.lineCap = .round
        smile.fillColor = .clear
        smile.position = CGPoint(x: 0, y: 6)
        smile.zPosition = 8
        root.addChild(smile)

        let foreheadMark = SKShapeNode(rectOf: CGSize(width: 38, height: 15), cornerRadius: 6)
        foreheadMark.fillColor = color(0x785142)
        foreheadMark.strokeColor = color(0x33251F)
        foreheadMark.lineWidth = 3
        foreheadMark.position = CGPoint(x: 0, y: 60)
        foreheadMark.zPosition = 8
        root.addChild(foreheadMark)
        let handle = SKShapeNode(rectOf: CGSize(width: 9, height: 23), cornerRadius: 4)
        handle.fillColor = color(0x785142)
        handle.strokeColor = color(0x33251F)
        handle.lineWidth = 3
        handle.position = CGPoint(x: 0, y: -14)
        foreheadMark.addChild(handle)

        let scarf = SKShapeNode(rectOf: CGSize(width: 91, height: 14), cornerRadius: 7)
        scarf.fillColor = color(0x3A8F82)
        scarf.strokeColor = color(0x214C48)
        scarf.lineWidth = 4
        scarf.position = CGPoint(x: 0, y: -10)
        scarf.zPosition = 9
        root.addChild(scarf)

        return root
    }

    private func makeLeadMonster(_ id: String) -> SKNode {
        switch id {
        case "swiftwing": return makeSwiftwingPet()
        case "mosshide": return makeMosshidePet()
        case "bellhorn": return makeBellhornPet()
        default: return makeHammerpaw()
        }
    }

    private func makeSwiftwingPet() -> SKNode {
        let root = SKNode()
        let shadow = SKShapeNode(ellipseOf: CGSize(width: 132, height: 22))
        shadow.fillColor = NSColor(calibratedWhite: 0.12, alpha: 0.18); shadow.strokeColor = .clear; shadow.position.y = -67; root.addChild(shadow)
        let wingBack = SKShapeNode(path: wingPath())
        wingBack.fillColor = color(0x5EAFC1); wingBack.strokeColor = color(0x214C58); wingBack.lineWidth = 6; wingBack.position = CGPoint(x: -39, y: 5); wingBack.zRotation = 0.15; root.addChild(wingBack)
        let body = SKShapeNode(ellipseOf: CGSize(width: 119, height: 95))
        style(body, fill: color(0x91CDD1), lineWidth: 6); body.position = CGPoint(x: 5, y: -7); root.addChild(body)
        let belly = SKShapeNode(ellipseOf: CGSize(width: 64, height: 61))
        belly.fillColor = color(0xD9F0E5); belly.strokeColor = .clear; belly.position = CGPoint(x: 17, y: -18); belly.zPosition = 2; root.addChild(belly)
        let head = SKShapeNode(circleOfRadius: 47)
        style(head, fill: color(0xA7D9D7), lineWidth: 6); head.position = CGPoint(x: 20, y: 39); head.zPosition = 4; root.addChild(head)
        let beak = SKShapeNode(path: trianglePath(width: 30, height: 25))
        beak.fillColor = color(0xE7AA45); beak.strokeColor = color(0x3B2B25); beak.lineWidth = 4; beak.position = CGPoint(x: 62, y: 34); beak.zPosition = 5; root.addChild(beak)
        let eye = SKShapeNode(circleOfRadius: 8)
        eye.fillColor = color(0x2A2925); eye.strokeColor = .clear; eye.position = CGPoint(x: 31, y: 51); eye.zPosition = 6; root.addChild(eye)
        let scarf = SKShapeNode(rectOf: CGSize(width: 78, height: 13), cornerRadius: 6)
        scarf.fillColor = color(0xDE655A); scarf.strokeColor = color(0x703A36); scarf.lineWidth = 4; scarf.position = CGPoint(x: 10, y: -3); scarf.zPosition = 8; root.addChild(scarf)
        return root
    }

    private func makeMosshidePet() -> SKNode {
        let root = SKNode()
        let shadow = SKShapeNode(ellipseOf: CGSize(width: 142, height: 24))
        shadow.fillColor = NSColor(calibratedWhite: 0.12, alpha: 0.18); shadow.strokeColor = .clear; shadow.position.y = -70; root.addChild(shadow)
        let shell = SKShapeNode(ellipseOf: CGSize(width: 136, height: 104))
        style(shell, fill: color(0x719F5A), lineWidth: 7); shell.position = CGPoint(x: -6, y: -10); root.addChild(shell)
        for point in [CGPoint(x: -34, y: 4), CGPoint(x: 4, y: 18), CGPoint(x: 34, y: -2)] {
            let moss = SKShapeNode(circleOfRadius: 18)
            moss.fillColor = color(0xA7C66D); moss.strokeColor = color(0x3E623B); moss.lineWidth = 3; moss.position = point; moss.zPosition = 2; root.addChild(moss)
        }
        let head = SKShapeNode(ellipseOf: CGSize(width: 79, height: 68))
        style(head, fill: color(0x89B36C), lineWidth: 6); head.position = CGPoint(x: 45, y: 13); head.zPosition = 4; root.addChild(head)
        for x in [31.0, 59.0] {
            let eye = SKShapeNode(circleOfRadius: 7); eye.fillColor = color(0x2A2925); eye.strokeColor = .clear; eye.position = CGPoint(x: x, y: 27); eye.zPosition = 6; root.addChild(eye)
        }
        let scarf = SKShapeNode(rectOf: CGSize(width: 89, height: 13), cornerRadius: 6)
        scarf.fillColor = color(0xC98A4E); scarf.strokeColor = color(0x6B4427); scarf.lineWidth = 4; scarf.position = CGPoint(x: 30, y: -13); scarf.zPosition = 8; root.addChild(scarf)
        return root
    }

    private func makeBellhornPet() -> SKNode {
        let root = SKNode()
        let shadow = SKShapeNode(ellipseOf: CGSize(width: 129, height: 24))
        shadow.fillColor = NSColor(calibratedWhite: 0.12, alpha: 0.18); shadow.strokeColor = .clear; shadow.position.y = -70; root.addChild(shadow)
        let body = SKShapeNode(ellipseOf: CGSize(width: 118, height: 106))
        style(body, fill: color(0x9C85BD), lineWidth: 7); body.position = CGPoint(x: 0, y: -16); root.addChild(body)
        let head = SKShapeNode(circleOfRadius: 50)
        style(head, fill: color(0xB6A1CF), lineWidth: 6); head.position = CGPoint(x: 0, y: 33); head.zPosition = 4; root.addChild(head)
        for x in [-27.0, 27.0] {
            let horn = SKShapeNode(path: hornPath(mirrored: x < 0))
            horn.fillColor = color(0xF0D28C); horn.strokeColor = color(0x634A3F); horn.lineWidth = 5; horn.position = CGPoint(x: x, y: 70); horn.zPosition = 2; root.addChild(horn)
            let eye = SKShapeNode(circleOfRadius: 7); eye.fillColor = color(0x2A2925); eye.strokeColor = .clear; eye.position = CGPoint(x: x, y: 42); eye.zPosition = 6; root.addChild(eye)
        }
        let bell = SKShapeNode(circleOfRadius: 12)
        bell.fillColor = color(0xF2C654); bell.strokeColor = color(0x5B431D); bell.lineWidth = 4; bell.position = CGPoint(x: 0, y: -4); bell.zPosition = 8; root.addChild(bell)
        return root
    }

    private func addBondCharm(to art: SKNode, snapshot: GameSnapshot, reducedMotion: Bool) {
        let charm = SKShapeNode(circleOfRadius: 12)
        charm.name = "bond-charm"
        charm.position = CGPoint(x: 0, y: -28)
        charm.fillColor = snapshot.bondCharges > 0 ? color(0xFFD660) : color(0x8BB1AA)
        charm.strokeColor = color(0x3A4B48)
        charm.lineWidth = 3
        charm.glowWidth = snapshot.bondCharges > 0 ? 5 : 0
        charm.zPosition = 15
        art.addChild(charm)

        guard snapshot.bondCharges > 0, !reducedMotion else { return }
        charm.run(.repeatForever(.sequence([
            .scale(to: 1.18, duration: 0.55),
            .scale(to: 0.95, duration: 0.55)
        ])))
    }

    private func decorate(state: PetState, art: SKNode, reducedMotion: Bool) {
        switch state {
        case .traveling:
            guard !reducedMotion else { return }
            art.run(.repeatForever(.sequence([
                .moveBy(x: 0, y: 4, duration: 0.45),
                .moveBy(x: 0, y: -4, duration: 0.45)
            ])))
        case .bondReady:
            let aura = SKShapeNode(circleOfRadius: 83)
            aura.fillColor = NSColor(calibratedRed: 1, green: 0.78, blue: 0.24, alpha: 0.13)
            aura.strokeColor = color(0xFFD25C)
            aura.lineWidth = 4
            aura.glowWidth = 10
            aura.zPosition = -3
            art.addChild(aura)
            guard !reducedMotion else { return }
            aura.run(.repeatForever(.sequence([
                .group([.scale(to: 1.13, duration: 0.7), .fadeAlpha(to: 0.42, duration: 0.7)]),
                .group([.scale(to: 0.92, duration: 0.7), .fadeAlpha(to: 1, duration: 0.7)])
            ])))
        case .eliteAlert:
            let mark = label("!", size: 38, color: color(0xD94B3C))
            mark.position = CGPoint(x: 78, y: 54)
            art.addChild(mark)
            if !reducedMotion {
                mark.run(.repeatForever(.sequence([.scale(to: 1.25, duration: 0.3), .scale(to: 1, duration: 0.3)])))
            }
        case .bursting:
            let partner = makeSwiftwingSilhouette()
            partner.position = CGPoint(x: -116, y: 26)
            partner.zPosition = 18
            addChild(partner)
            let flash = SKShapeNode(circleOfRadius: 104)
            flash.fillColor = NSColor(calibratedRed: 1, green: 0.86, blue: 0.37, alpha: 0.18)
            flash.strokeColor = color(0xFFE16E)
            flash.lineWidth = 5
            flash.glowWidth = 14
            flash.zPosition = -2
            addChild(flash)
            guard !reducedMotion else { return }
            partner.alpha = 0
            art.run(.sequence([
                .wait(forDuration: 0.3),
                .scale(to: 0.88, duration: 0.45),
                .wait(forDuration: 0.35),
                .group([.moveBy(x: 30, y: 8, duration: 0.38), .scale(to: 1.22, duration: 0.38)]),
                .wait(forDuration: 0.7),
                .group([.moveBy(x: -30, y: -8, duration: 0.55), .scale(to: 1, duration: 0.55)]),
                .wait(forDuration: 1.1)
            ]))
            partner.run(.sequence([
                .wait(forDuration: 0.78),
                .fadeIn(withDuration: 0.3),
                .moveBy(x: 82, y: 8, duration: 0.65),
                .wait(forDuration: 1.6),
                .fadeOut(withDuration: 0.5)
            ]))
            flash.run(.sequence([
                .wait(forDuration: 1.2),
                .group([.scale(to: 1.35, duration: 0.32), .fadeAlpha(to: 0.95, duration: 0.32)]),
                .fadeOut(withDuration: 0.8)
            ]))
        case .rewardReady:
            let chest = makeChest()
            chest.position = CGPoint(x: 79, y: -48)
            chest.zPosition = 18
            art.addChild(chest)
            if !reducedMotion {
                chest.run(.repeatForever(.sequence([
                    .moveBy(x: 0, y: 7, duration: 0.45),
                    .moveBy(x: 0, y: -7, duration: 0.45),
                    .wait(forDuration: 0.5)
                ])))
            }
        case .training:
            let stump = SKShapeNode(rectOf: CGSize(width: 43, height: 57), cornerRadius: 9)
            stump.fillColor = color(0x86633D)
            stump.strokeColor = color(0x3A2A1E)
            stump.lineWidth = 5
            stump.position = CGPoint(x: 82, y: -47)
            stump.zPosition = 1
            art.addChild(stump)
            let paw = SKShapeNode(ellipseOf: CGSize(width: 38, height: 28))
            paw.fillColor = color(0xE4A65C)
            paw.strokeColor = color(0x3B2B25)
            paw.lineWidth = 4
            paw.position = CGPoint(x: 52, y: -18)
            paw.zPosition = 17
            art.addChild(paw)
            if !reducedMotion {
                paw.run(.repeatForever(.sequence([
                    .rotate(toAngle: -0.45, duration: 0.25),
                    .group([.rotate(toAngle: 0.2, duration: 0.12), .moveBy(x: 10, y: -5, duration: 0.12)]),
                    .moveBy(x: -10, y: 5, duration: 0.18),
                    .wait(forDuration: 0.55)
                ])))
            }
        case .offlineReturn:
            let satchel = SKShapeNode(rectOf: CGSize(width: 48, height: 38), cornerRadius: 9)
            satchel.fillColor = color(0xA9683A)
            satchel.strokeColor = color(0x4B3021)
            satchel.lineWidth = 5
            satchel.position = CGPoint(x: 62, y: -23)
            satchel.zPosition = 17
            art.addChild(satchel)
            for index in 0..<3 {
                let star = label("✦", size: 22, color: color(0xFFD25C))
                star.position = CGPoint(x: CGFloat(index * 34 - 34), y: CGFloat(70 + (index % 2) * 10))
                star.zPosition = 20
                art.addChild(star)
                if !reducedMotion {
                    star.run(.repeatForever(.sequence([
                        .wait(forDuration: Double(index) * 0.18),
                        .fadeAlpha(to: 0.25, duration: 0.4),
                        .fadeAlpha(to: 1, duration: 0.4)
                    ])))
                }
            }
        case .linkUnavailable:
            let link = label("⌁", size: 43, color: color(0x6D7480))
            link.position = CGPoint(x: 78, y: 45)
            link.zRotation = 0.7
            art.addChild(link)
            let slash = SKShapeNode(rectOf: CGSize(width: 5, height: 48), cornerRadius: 2)
            slash.fillColor = color(0xD65B4A)
            slash.strokeColor = .clear
            slash.position = CGPoint(x: 78, y: 45)
            slash.zRotation = -0.75
            art.addChild(slash)
            if !reducedMotion {
                link.run(.repeatForever(.sequence([.fadeAlpha(to: 0.45, duration: 0.8), .fadeAlpha(to: 1, duration: 0.8)])))
            }
        }
    }

    private func makeSwiftwingSilhouette() -> SKNode {
        let root = SKNode()
        let body = SKShapeNode(ellipseOf: CGSize(width: 61, height: 43))
        body.fillColor = color(0x4BA6C7)
        body.strokeColor = color(0x1E4B60)
        body.lineWidth = 4
        root.addChild(body)
        let wing = SKShapeNode(path: wingPath())
        wing.fillColor = color(0x79D1DC)
        wing.strokeColor = color(0x1E4B60)
        wing.lineWidth = 4
        wing.position = CGPoint(x: -8, y: 6)
        root.addChild(wing)
        let eye = SKShapeNode(circleOfRadius: 4)
        eye.fillColor = .white
        eye.strokeColor = .clear
        eye.position = CGPoint(x: 19, y: 8)
        root.addChild(eye)
        return root
    }

    private func makeChest() -> SKNode {
        let root = SKNode()
        let base = SKShapeNode(rectOf: CGSize(width: 54, height: 37), cornerRadius: 7)
        base.fillColor = color(0xB8733C)
        base.strokeColor = color(0x4B2D1D)
        base.lineWidth = 5
        root.addChild(base)
        let band = SKShapeNode(rectOf: CGSize(width: 10, height: 38), cornerRadius: 3)
        band.fillColor = color(0xF0C95D)
        band.strokeColor = color(0x5B451C)
        band.lineWidth = 3
        root.addChild(band)
        return root
    }

    private func style(_ node: SKShapeNode, fill: NSColor, lineWidth: CGFloat) {
        node.fillColor = fill
        node.strokeColor = color(0x3B2B25)
        node.lineWidth = lineWidth
        node.lineJoin = .round
        node.lineCap = .round
    }

    private func label(_ text: String, size: CGFloat, color: NSColor) -> SKLabelNode {
        let node = SKLabelNode(fontNamed: "Avenir Next Heavy")
        node.text = text
        node.fontSize = size
        node.fontColor = color
        node.verticalAlignmentMode = .center
        node.horizontalAlignmentMode = .center
        node.zPosition = 20
        return node
    }

    private func color(_ rgb: Int) -> NSColor {
        NSColor(
            calibratedRed: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }

    private func earPath(mirrored: Bool) -> CGPath {
        let sign: CGFloat = mirrored ? -1 : 1
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: 0))
        path.addLine(to: CGPoint(x: sign * 21, y: 39))
        path.addLine(to: CGPoint(x: sign * -18, y: 25))
        path.closeSubpath()
        return path
    }

    private func tailPath() -> CGPath {
        let path = CGMutablePath()
        path.move(to: .zero)
        path.addCurve(to: CGPoint(x: 31, y: 30), control1: CGPoint(x: 30, y: -5), control2: CGPoint(x: 39, y: 18))
        path.addCurve(to: CGPoint(x: 14, y: 42), control1: CGPoint(x: 27, y: 38), control2: CGPoint(x: 21, y: 42))
        path.addCurve(to: .zero, control1: CGPoint(x: 12, y: 20), control2: CGPoint(x: 5, y: 9))
        path.closeSubpath()
        return path
    }

    private func trianglePath(width: CGFloat, height: CGFloat) -> CGPath {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -width / 2, y: -height / 2))
        path.addLine(to: CGPoint(x: width / 2, y: 0))
        path.addLine(to: CGPoint(x: -width / 2, y: height / 2))
        path.closeSubpath()
        return path
    }

    private func hornPath(mirrored: Bool) -> CGPath {
        let sign: CGFloat = mirrored ? -1 : 1
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: 0))
        path.addCurve(to: CGPoint(x: sign * 13, y: 31), control1: CGPoint(x: sign * 3, y: 12), control2: CGPoint(x: sign * 18, y: 20))
        path.addCurve(to: CGPoint(x: sign * 3, y: 17), control1: CGPoint(x: sign * 6, y: 23), control2: CGPoint(x: sign * 2, y: 20))
        path.addLine(to: CGPoint(x: 0, y: 0))
        path.closeSubpath()
        return path
    }

    private func smilePath() -> CGPath {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: 4))
        path.addCurve(to: CGPoint(x: -15, y: -4), control1: CGPoint(x: -4, y: -2), control2: CGPoint(x: -10, y: -5))
        path.move(to: CGPoint(x: 0, y: 4))
        path.addCurve(to: CGPoint(x: 15, y: -4), control1: CGPoint(x: 4, y: -2), control2: CGPoint(x: 10, y: -5))
        return path
    }

    private func wingPath() -> CGPath {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: 0))
        path.addCurve(to: CGPoint(x: -48, y: 20), control1: CGPoint(x: -20, y: 31), control2: CGPoint(x: -38, y: 30))
        path.addCurve(to: CGPoint(x: -15, y: -15), control1: CGPoint(x: -37, y: 2), control2: CGPoint(x: -26, y: -12))
        path.closeSubpath()
        return path
    }
}
