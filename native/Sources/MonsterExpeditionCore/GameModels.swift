import Foundation

public enum Locale: String, Codable, CaseIterable, Sendable {
    case english = "en"
    case simplifiedChinese = "zh-CN"
}

public enum CodexLinkState: String, Codable, CaseIterable, Sendable {
    case notConfigured = "not-configured"
    case restartRequired = "restart-required"
    case connected
    case configConflict = "config-conflict"
    case unavailable
}

public enum PetState: String, Codable, CaseIterable, Sendable {
    case traveling
    case bondReady = "bond-ready"
    case eliteAlert = "elite-alert"
    case bursting
    case rewardReady = "reward-ready"
    case training
    case offlineReturn = "offline-return"
    case linkUnavailable = "link-unavailable"
}

public struct Preferences: Codable, Equatable, Sendable {
    public var locale: Locale
    public var reducedMotion: Bool
    public var muted: Bool

    public init(
        locale: Locale = .english,
        reducedMotion: Bool = false,
        muted: Bool = false
    ) {
        self.locale = locale
        self.reducedMotion = reducedMotion
        self.muted = muted
    }
}

public struct GameSnapshot: Codable, Equatable, Sendable {
    public static let tokenThreshold = 100_000
    public static let maximumBondCharges = 2

    public var revision: Int
    public var expeditionSeconds: Int
    public var routeID: String
    public var leadMonsterID: String
    public var partnerMonsterID: String?
    public var petState: PetState
    public var codexLinkState: CodexLinkState
    public var tokenProgress: Int
    public var bondCharges: Int
    public var pendingRewards: Int
    public var gold: Int
    public var trainerXP: Int
    public var gearMaterials: Int
    public var preferences: Preferences
    public var lastSyncedAt: Date

    public init(
        revision: Int = 0,
        expeditionSeconds: Int = 0,
        routeID: String = "windmill-plains-01",
        leadMonsterID: String = "hammerpaw",
        partnerMonsterID: String? = nil,
        petState: PetState = .traveling,
        codexLinkState: CodexLinkState = .notConfigured,
        tokenProgress: Int = 0,
        bondCharges: Int = 0,
        pendingRewards: Int = 0,
        gold: Int = 0,
        trainerXP: Int = 0,
        gearMaterials: Int = 0,
        preferences: Preferences = Preferences(),
        lastSyncedAt: Date = Date()
    ) {
        self.revision = revision
        self.expeditionSeconds = expeditionSeconds
        self.routeID = routeID
        self.leadMonsterID = leadMonsterID
        self.partnerMonsterID = partnerMonsterID
        self.petState = petState
        self.codexLinkState = codexLinkState
        self.tokenProgress = tokenProgress
        self.bondCharges = bondCharges
        self.pendingRewards = pendingRewards
        self.gold = gold
        self.trainerXP = trainerXP
        self.gearMaterials = gearMaterials
        self.preferences = preferences
        self.lastSyncedAt = lastSyncedAt
    }
}

public enum GameCopy {
    public static func petStatus(_ state: PetState, locale: Locale) -> String {
        switch (locale, state) {
        case (.english, .traveling): "Exploring Windmill Plains"
        case (.english, .bondReady): "Bond Burst ready!"
        case (.english, .eliteAlert): "A strong foe is near"
        case (.english, .bursting): "Together!"
        case (.english, .rewardReady): "A reward for you"
        case (.english, .training): "Studying the trail"
        case (.english, .offlineReturn): "Welcome back!"
        case (.english, .linkUnavailable): "Codex Link unavailable"
        case (.simplifiedChinese, .traveling): "正在探索风车草原"
        case (.simplifiedChinese, .bondReady): "羁绊爆发已就绪！"
        case (.simplifiedChinese, .eliteAlert): "强敌正在靠近"
        case (.simplifiedChinese, .bursting): "一起上！"
        case (.simplifiedChinese, .rewardReady): "给你带回了奖励"
        case (.simplifiedChinese, .training): "正在研究足迹"
        case (.simplifiedChinese, .offlineReturn): "欢迎回来！"
        case (.simplifiedChinese, .linkUnavailable): "Codex连接暂不可用"
        }
    }

    public static func monsterName(_ id: String, locale: Locale) -> String {
        let names: [String: (String, String)] = [
            "hammerpaw": ("Hammerpaw", "槌爪兽"),
            "swiftwing": ("Swiftwing", "疾羽兽"),
            "mosshide": ("Mosshide", "苔甲兽"),
            "bellhorn": ("Bellhorn", "鸣角兽")
        ]
        let name = names[id] ?? (id, id)
        return locale == .english ? name.0 : name.1
    }
}

public enum SnapshotCoding {
    public static func encoder(prettyPrinted: Bool = false) -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if prettyPrinted {
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        } else {
            encoder.outputFormatting = [.sortedKeys]
        }
        return encoder
    }

    public static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
