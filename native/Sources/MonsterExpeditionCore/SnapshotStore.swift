import Foundation
import SQLite3

public enum SnapshotStoreError: Error, LocalizedError, Sendable {
    case openFailed(String)
    case sqlite(String)
    case missingSnapshot

    public var errorDescription: String? {
        switch self {
        case .openFailed(let message): "Could not open snapshot database: \(message)"
        case .sqlite(let message): "SQLite error: \(message)"
        case .missingSnapshot: "The snapshot row is missing."
        }
    }
}

public enum MutationResult: Sendable {
    case applied(GameSnapshot)
    case duplicate(GameSnapshot)
    case conflict(GameSnapshot)
}

public final class SQLiteSnapshotStore: @unchecked Sendable {
    public let databaseURL: URL

    private let lock = NSLock()
    private var database: OpaquePointer?

    public static func defaultApplicationSupportURL() throws -> URL {
        // Kept for local smoke tests and isolated development. Public builds do
        // not set this and always use the documented Application Support path.
        if let override = ProcessInfo.processInfo.environment["MONSTER_EXPEDITION_DATA_DIR"],
           !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return root.appendingPathComponent("Monster Expedition", isDirectory: true)
    }

    public convenience init() throws {
        let directory = try Self.defaultApplicationSupportURL()
        try self.init(databaseURL: directory.appendingPathComponent("monster-expedition.sqlite"))
    }

    public init(databaseURL: URL) throws {
        self.databaseURL = databaseURL
        let directory = databaseURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )

        var opened: OpaquePointer?
        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(databaseURL.path, &opened, flags, nil) == SQLITE_OK else {
            let message = opened.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown error"
            if let opened { sqlite3_close(opened) }
            throw SnapshotStoreError.openFailed(message)
        }
        database = opened
        try executeUnlocked("PRAGMA journal_mode=WAL;")
        try executeUnlocked("PRAGMA synchronous=FULL;")
        try executeUnlocked("PRAGMA busy_timeout=2000;")
        try executeUnlocked(
            """
            CREATE TABLE IF NOT EXISTS snapshot (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload BLOB NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        try executeUnlocked(
            """
            CREATE TABLE IF NOT EXISTS processed_commands (
                command_id TEXT PRIMARY KEY,
                applied_revision INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )

        if try loadUnlocked() == nil {
            try saveUnlocked(GameSnapshot())
        }
    }

    deinit {
        if let database {
            sqlite3_close(database)
        }
    }

    public func load() throws -> GameSnapshot {
        lock.lock()
        defer { lock.unlock() }
        guard let snapshot = try loadUnlocked() else {
            throw SnapshotStoreError.missingSnapshot
        }
        return snapshot
    }

    public func replace(_ snapshot: GameSnapshot) throws {
        lock.lock()
        defer { lock.unlock() }
        try saveUnlocked(snapshot)
    }

    public func mutate(
        commandID: String?,
        expectedRevision: Int?,
        _ body: (inout GameSnapshot) throws -> Void
    ) throws -> MutationResult {
        lock.lock()
        defer { lock.unlock() }
        try executeUnlocked("BEGIN IMMEDIATE;")
        do {
            guard var snapshot = try loadUnlocked() else {
                throw SnapshotStoreError.missingSnapshot
            }

            if let commandID, try commandExistsUnlocked(commandID) {
                try executeUnlocked("ROLLBACK;")
                return .duplicate(snapshot)
            }
            if let expectedRevision, snapshot.revision != expectedRevision {
                try executeUnlocked("ROLLBACK;")
                return .conflict(snapshot)
            }

            try body(&snapshot)
            snapshot.revision += 1
            try saveUnlocked(snapshot)
            if let commandID {
                try insertCommandUnlocked(commandID, revision: snapshot.revision)
            }
            try executeUnlocked("COMMIT;")
            return .applied(snapshot)
        } catch {
            try? executeUnlocked("ROLLBACK;")
            throw error
        }
    }

    private func executeUnlocked(_ sql: String) throws {
        var errorMessage: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
            let message = errorMessage.map { String(cString: $0) } ?? currentErrorMessage()
            sqlite3_free(errorMessage)
            throw SnapshotStoreError.sqlite(message)
        }
    }

    private func loadUnlocked() throws -> GameSnapshot? {
        let sql = "SELECT payload FROM snapshot WHERE id = 1;"
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        defer { sqlite3_finalize(statement) }
        let result = sqlite3_step(statement)
        if result == SQLITE_DONE { return nil }
        guard result == SQLITE_ROW else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        guard let bytes = sqlite3_column_blob(statement, 0) else {
            throw SnapshotStoreError.sqlite("Snapshot payload was empty.")
        }
        let count = Int(sqlite3_column_bytes(statement, 0))
        let data = Data(bytes: bytes, count: count)
        return try SnapshotCoding.decoder().decode(GameSnapshot.self, from: data)
    }

    private func saveUnlocked(_ snapshot: GameSnapshot) throws {
        let data = try SnapshotCoding.encoder().encode(snapshot)
        let sql =
            "INSERT INTO snapshot (id, payload, updated_at) VALUES (1, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;"
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        defer { sqlite3_finalize(statement) }
        let bindResult = data.withUnsafeBytes { buffer in
            sqlite3_bind_blob(statement, 1, buffer.baseAddress, Int32(buffer.count), sqliteTransient)
        }
        guard bindResult == SQLITE_OK else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        let timestamp = ISO8601DateFormatter().string(from: Date())
        guard sqlite3_bind_text(statement, 2, timestamp, -1, sqliteTransient) == SQLITE_OK,
              sqlite3_step(statement) == SQLITE_DONE else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
    }

    private func commandExistsUnlocked(_ commandID: String) throws -> Bool {
        let sql = "SELECT 1 FROM processed_commands WHERE command_id = ? LIMIT 1;"
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_bind_text(statement, 1, commandID, -1, sqliteTransient) == SQLITE_OK else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        return sqlite3_step(statement) == SQLITE_ROW
    }

    private func insertCommandUnlocked(_ commandID: String, revision: Int) throws {
        let sql = "INSERT INTO processed_commands (command_id, applied_revision, created_at) VALUES (?, ?, ?);"
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
        defer { sqlite3_finalize(statement) }
        let timestamp = ISO8601DateFormatter().string(from: Date())
        guard sqlite3_bind_text(statement, 1, commandID, -1, sqliteTransient) == SQLITE_OK,
              sqlite3_bind_int64(statement, 2, Int64(revision)) == SQLITE_OK,
              sqlite3_bind_text(statement, 3, timestamp, -1, sqliteTransient) == SQLITE_OK,
              sqlite3_step(statement) == SQLITE_DONE else {
            throw SnapshotStoreError.sqlite(currentErrorMessage())
        }
    }

    private func currentErrorMessage() -> String {
        database.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown SQLite error"
    }
}

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
