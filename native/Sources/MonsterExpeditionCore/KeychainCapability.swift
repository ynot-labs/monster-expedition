import Foundation
import Security

public enum CapabilityKeyError: Error, LocalizedError, Sendable {
    case keychain(OSStatus)
    case invalidData

    public var errorDescription: String? {
        switch self {
        case .keychain(let status): "Keychain operation failed (\(status))."
        case .invalidData: "The capability key stored in Keychain is invalid."
        }
    }
}

public enum CapabilityKeyStore {
    private static let service = "com.sillydao.monster-expedition"
    private static let account = "runtime-capability"

    public static func getOrCreate() throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess {
            guard let data = result as? Data,
                  let key = String(data: data, encoding: .utf8),
                  !key.isEmpty else {
                throw CapabilityKeyError.invalidData
            }
            return key
        }
        guard status == errSecItemNotFound else {
            throw CapabilityKeyError.keychain(status)
        }

        var random = [UInt8](repeating: 0, count: 32)
        let randomStatus = SecRandomCopyBytes(kSecRandomDefault, random.count, &random)
        guard randomStatus == errSecSuccess else {
            throw CapabilityKeyError.keychain(randomStatus)
        }
        let key = Data(random).base64EncodedString()
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(key.utf8)
        ]
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            // Another process may have won the first-launch race.
            if addStatus == errSecDuplicateItem {
                return try getOrCreate()
            }
            throw CapabilityKeyError.keychain(addStatus)
        }
        return key
    }
}
