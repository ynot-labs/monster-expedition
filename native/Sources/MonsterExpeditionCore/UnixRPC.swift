import Darwin
import Foundation

public enum UnixRPCError: Error, LocalizedError, Sendable {
    case socket(String)
    case pathTooLong
    case noResponse

    public var errorDescription: String? {
        switch self {
        case .socket(let message): "Unix socket error: \(message)"
        case .pathTooLong: "Unix socket path is too long."
        case .noResponse: "The helper returned no response."
        }
    }
}

public final class UnixRPCServer: @unchecked Sendable {
    public let socketURL: URL

    private let handler: @Sendable (Data) -> Data
    private let queue = DispatchQueue(label: "monster-expedition.rpc.accept", qos: .utility)
    private let clients = DispatchQueue(label: "monster-expedition.rpc.clients", qos: .utility, attributes: .concurrent)
    private let stateLock = NSLock()
    private var descriptor: Int32 = -1
    private var running = false

    public init(socketURL: URL, handler: @escaping @Sendable (Data) -> Data) {
        self.socketURL = socketURL
        self.handler = handler
    }

    public func start() throws {
        stateLock.lock()
        defer { stateLock.unlock() }
        guard !running else { return }

        let path = socketURL.path
        guard path.utf8.count < MemoryLayout.size(ofValue: sockaddr_un().sun_path) else {
            throw UnixRPCError.pathTooLong
        }
        try FileManager.default.createDirectory(
            at: socketURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        Darwin.unlink(path)

        let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw UnixRPCError.socket(lastPOSIXError()) }
        var address = makeUnixAddress(path: path)
        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            Darwin.close(fd)
            throw UnixRPCError.socket(lastPOSIXError())
        }
        guard Darwin.chmod(path, S_IRUSR | S_IWUSR) == 0 else {
            Darwin.close(fd)
            Darwin.unlink(path)
            throw UnixRPCError.socket(lastPOSIXError())
        }
        guard Darwin.listen(fd, 8) == 0 else {
            Darwin.close(fd)
            Darwin.unlink(path)
            throw UnixRPCError.socket(lastPOSIXError())
        }

        descriptor = fd
        running = true
        queue.async { [weak self] in self?.acceptLoop() }
    }

    public func stop() {
        stateLock.lock()
        let fd = descriptor
        descriptor = -1
        running = false
        stateLock.unlock()
        if fd >= 0 {
            Darwin.shutdown(fd, SHUT_RDWR)
            Darwin.close(fd)
        }
        Darwin.unlink(socketURL.path)
    }

    deinit { stop() }

    private func acceptLoop() {
        while isRunning {
            let client = Darwin.accept(currentDescriptor, nil, nil)
            if client < 0 {
                if isRunning { continue }
                return
            }
            clients.async { [weak self] in self?.serve(client) }
        }
    }

    private func serve(_ client: Int32) {
        defer { Darwin.close(client) }
        var pending = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while true {
            let count = Darwin.read(client, &buffer, buffer.count)
            if count <= 0 { return }
            pending.append(buffer, count: count)
            while let newline = pending.firstIndex(of: 0x0A) {
                let line = pending[..<newline]
                pending.removeSubrange(...newline)
                guard !line.isEmpty else { continue }
                var response = handler(Data(line))
                response.append(0x0A)
                guard writeAll(client, data: response) else { return }
            }
        }
    }

    private var isRunning: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return running
    }

    private var currentDescriptor: Int32 {
        stateLock.lock()
        defer { stateLock.unlock() }
        return descriptor
    }
}

public enum UnixRPCClient {
    public static func send(line: Data, socketURL: URL) throws -> Data {
        let path = socketURL.path
        guard path.utf8.count < MemoryLayout.size(ofValue: sockaddr_un().sun_path) else {
            throw UnixRPCError.pathTooLong
        }
        let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw UnixRPCError.socket(lastPOSIXError()) }
        defer { Darwin.close(fd) }

        var address = makeUnixAddress(path: path)
        let connectResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connectResult == 0 else { throw UnixRPCError.socket(lastPOSIXError()) }

        var request = line
        request.append(0x0A)
        guard writeAll(fd, data: request) else { throw UnixRPCError.socket(lastPOSIXError()) }

        var response = Data()
        var byte: UInt8 = 0
        while Darwin.read(fd, &byte, 1) == 1 {
            if byte == 0x0A { return response }
            response.append(byte)
        }
        throw UnixRPCError.noResponse
    }
}

private func makeUnixAddress(path: String) -> sockaddr_un {
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let pathCapacity = MemoryLayout.size(ofValue: address.sun_path)
    path.withCString { source in
        withUnsafeMutablePointer(to: &address.sun_path) { tuplePointer in
            tuplePointer.withMemoryRebound(to: CChar.self, capacity: pathCapacity) {
                _ = Darwin.strlcpy($0, source, pathCapacity)
            }
        }
    }
    return address
}

private func writeAll(_ descriptor: Int32, data: Data) -> Bool {
    data.withUnsafeBytes { rawBuffer in
        guard let baseAddress = rawBuffer.baseAddress else { return true }
        var offset = 0
        while offset < rawBuffer.count {
            let written = Darwin.write(descriptor, baseAddress.advanced(by: offset), rawBuffer.count - offset)
            if written <= 0 { return false }
            offset += written
        }
        return true
    }
}

private func lastPOSIXError() -> String {
    String(cString: strerror(errno))
}
