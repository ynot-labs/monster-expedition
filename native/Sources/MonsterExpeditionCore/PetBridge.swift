import Foundation

/// A deliberately narrow, local-only visual bridge from the MCP game process to
/// the desktop companion. It contains no prompts, replies, session IDs, model
/// names, or transcript data—only the fields needed to render the Pet.
public struct PetBridgeSnapshot: Codable, Sendable {
    public let schemaVersion: Int
    public let revision: Int
    public let leadMonsterID: String
    public let partnerMonsterID: String?
    public let routeID: String
    public let petState: PetState
    public let codexLinkState: CodexLinkState
    public let tokenProgress: Int
    public let bondCharges: Int
    public let pendingRewards: Int
    public let gold: Int
    public let trainerXP: Int
    public let gearMaterials: Int
    public let locale: Locale
    public let updatedAt: Date

    public static func bridgeURL() throws -> URL {
        let root = try SQLiteSnapshotStore.defaultApplicationSupportURL()
        return root.appendingPathComponent("pet-bridge.json")
    }

    public static func load() -> PetBridgeSnapshot? {
        guard let url = try? bridgeURL(),
              let data = try? Data(contentsOf: url),
              let bridge = try? SnapshotCoding.decoder().decode(PetBridgeSnapshot.self, from: data),
              bridge.schemaVersion == 1 else {
            return nil
        }
        return bridge
    }

    public func gameSnapshot() -> GameSnapshot {
        GameSnapshot(
            revision: revision,
            expeditionSeconds: 0,
            routeID: routeID,
            leadMonsterID: leadMonsterID,
            partnerMonsterID: partnerMonsterID,
            petState: petState,
            codexLinkState: codexLinkState,
            tokenProgress: tokenProgress,
            bondCharges: bondCharges,
            pendingRewards: pendingRewards,
            gold: gold,
            trainerXP: trainerXP,
            gearMaterials: gearMaterials,
            preferences: Preferences(locale: locale),
            lastSyncedAt: updatedAt
        )
    }
}
