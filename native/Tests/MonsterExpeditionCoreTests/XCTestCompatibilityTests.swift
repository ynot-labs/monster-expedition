#if canImport(XCTest)
import Foundation
import XCTest
@testable import MonsterExpeditionCore

/// Xcode's XCTest runner executes these compatibility checks. The standalone
/// Command Line Tools installation used by this repository does not ship
/// XCTest.framework, so `scripts/test.sh` runs the fuller Swift Testing suite.
final class MonsterExpeditionXCTestCompatibilityTests: XCTestCase {
    func testDefaultSnapshotStartsWithHammerpaw() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("me-xctest-\(UUID().uuidString)", isDirectory: true)
        let store = try SQLiteSnapshotStore(databaseURL: directory.appendingPathComponent("test.sqlite"))
        let snapshot = try store.load()
        XCTAssertEqual(snapshot.leadMonsterID, "hammerpaw")
        XCTAssertEqual(snapshot.bondCharges, 0)
        XCTAssertEqual(snapshot.preferences.locale, .english)
    }

    func testChineseStatusCopyIsAvailable() {
        XCTAssertEqual(GameCopy.petStatus(.bondReady, locale: .simplifiedChinese), "羁绊爆发已就绪！")
    }
}
#endif
