import Foundation
import Security

public enum CapabilityKeyError: Error, LocalizedError, Sendable {
    case randomGeneration(OSStatus)
    case invalidData

    public var errorDescription: String? {
        switch self {
        case .randomGeneration(let status): "Secure local key generation failed (\(status))."
        case .invalidData: "The local capability key is invalid."
        }
    }
}

public enum CapabilityKeyStore {
    private static let filename = "runtime-capability.key"

    public static func getOrCreate() throws -> String {
        if let override = ProcessInfo.processInfo.environment["MONSTER_EXPEDITION_CAPABILITY_KEY"], !override.isEmpty {
            return override
        }
        let directory = try SQLiteSnapshotStore.defaultApplicationSupportURL()
        let url = directory.appendingPathComponent(filename)
        if FileManager.default.fileExists(atPath: url.path) {
            guard let key = try? String(contentsOf: url, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines), !key.isEmpty else {
                throw CapabilityKeyError.invalidData
            }
            return key
        }

        var random = [UInt8](repeating: 0, count: 32)
        let randomStatus = SecRandomCopyBytes(kSecRandomDefault, random.count, &random)
        guard randomStatus == errSecSuccess else {
            throw CapabilityKeyError.randomGeneration(randomStatus)
        }
        let key = Data(random).base64EncodedString()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try Data((key + "\n").utf8).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        return key
    }
}
