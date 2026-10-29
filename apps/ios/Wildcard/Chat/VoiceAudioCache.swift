import Foundation

/// A recorded clip held in memory from release until the server accepts it, so a failed
/// send can be retried with the same bytes and submission ID.
struct VoiceClip: Equatable, Sendable {
    let id = UUID()
    let data: Data
    let durationMs: Int

    static func == (lhs: VoiceClip, rhs: VoiceClip) -> Bool { lhs.id == rhs.id }

    var metadata: MessageVoice { MessageVoice(durationMs: durationMs, listenedAt: nil, transcript: nil) }

    /// Duration of a PCM WAV from its `fmt ` byte rate and `data` chunk size.
    /// AVAudioRecorder may insert padding chunks, so the header is not assumed to be 44 bytes.
    nonisolated static func wavDurationMs(_ data: Data) -> Int? {
        let bytes = [UInt8](data)
        func word(_ offset: Int) -> Int {
            Int(bytes[offset]) | Int(bytes[offset + 1]) << 8 | Int(bytes[offset + 2]) << 16 | Int(bytes[offset + 3]) << 24
        }
        guard bytes.count >= 12, bytes[0..<4].elementsEqual("RIFF".utf8), bytes[8..<12].elementsEqual("WAVE".utf8) else { return nil }
        var offset = 12
        var byteRate: Int?
        while offset + 8 <= bytes.count {
            let size = word(offset + 4)
            let id = bytes[offset..<(offset + 4)]
            if id.elementsEqual("fmt ".utf8), offset + 20 <= bytes.count { byteRate = word(offset + 16) }
            if id.elementsEqual("data".utf8) {
                guard let byteRate, byteRate > 0 else { return nil }
                let available = min(size, bytes.count - offset - 8)
                return available * 1000 / byteRate
            }
            offset += 8 + size + (size & 1)
        }
        return nil
    }
}

/// `voice` in send bodies; `Data` encodes as base64.
struct VoiceInput: Encodable { let data: Data }

enum VoiceAudioResource: Hashable, Sendable {
    /// The person's voice message in a private chat.
    case userVoice(contactID: String, turnID: String)
    /// One message of a contact's reply; `part` is its index in `assistantMessages`.
    case contactVoice(contactID: String, turnID: String, part: Int)
    case groupVoice(groupID: String, messageID: String)
    /// A catalog voice sample for the contact voice picker.
    case voicePreview(voiceID: String)

    var key: String {
        switch self {
        case let .userVoice(id, turn): return "contact/\(id)/voice/\(turn)/user"
        case let .contactVoice(id, turn, part): return "contact/\(id)/voice/\(turn)/assistant/\(part)"
        case let .groupVoice(id, message): return "group/\(id)/voice/\(message)"
        case let .voicePreview(id): return "voices/\(id)/preview"
        }
    }
}

/// Account-scoped voice audio: a small memory cache in front of the protected disk cache.
/// Owned by `PrivateImageCache`, which forwards activation and clears.
@MainActor
final class VoiceAudioCache {
    private let memory = NSCache<NSString, NSData>()
    private let disk = ProtectedDiskCache(directory: "PrivateAudio-v1")
    private var userID: String?
    private var session = UUID()
    private struct Request {
        let id = UUID()
        let task: Task<Data, Error>
    }
    private var requests: [String: Request] = [:]

    init() {
        memory.totalCostLimit = 8 * 1024 * 1024
    }

    func activate(userID: String) {
        guard self.userID != userID else { return }
        resetMemory()
        self.userID = userID
    }

    func clear(deactivate: Bool = true) async {
        let previousUser = userID
        let previousSession = session
        resetMemory()
        if deactivate { userID = nil }
        await disk.clear(userID: previousUser, session: previousSession)
    }

    private func resetMemory() {
        session = UUID()
        for request in requests.values { request.task.cancel() }
        requests.removeAll()
        memory.removeAllObjects()
    }

    func cachedData(_ resource: VoiceAudioResource) -> Data? {
        guard userID != nil else { return nil }
        return memory.object(forKey: resource.key as NSString) as Data?
    }

    /// Seeds the cache with an outgoing clip once the server has accepted it.
    func store(_ data: Data, for resource: VoiceAudioResource) async {
        guard let userID else { return }
        let currentSession = session
        memory.setObject(data as NSData, forKey: resource.key as NSString, cost: data.count)
        await disk.write(data, userID: userID, key: resource.key, session: currentSession)
    }

    /// Drops bytes that could not be played so a retry downloads them again.
    func remove(_ resource: VoiceAudioResource) async {
        memory.removeObject(forKey: resource.key as NSString)
        guard let userID else { return }
        await disk.remove(userID: userID, key: resource.key)
    }

    /// Concurrent requests for the same key share one disk read or download.
    func data(_ resource: VoiceAudioResource, fetch: @escaping @MainActor () async throws -> Data) async throws -> Data {
        guard let userID else { throw CancellationError() }
        if let data = cachedData(resource) { return data }
        let currentSession = session
        let request: Request
        if let pending = requests[resource.key] { request = pending }
        else {
            let disk = disk
            request = Request(task: Task {
                if let cached = await disk.read(userID: userID, key: resource.key, session: currentSession) { return cached }
                let downloaded = try await fetch()
                try Task.checkCancellation()
                await disk.write(downloaded, userID: userID, key: resource.key, session: currentSession)
                return downloaded
            })
            requests[resource.key] = request
        }
        defer {
            if requests[resource.key]?.id == request.id { requests.removeValue(forKey: resource.key) }
        }
        let data = try await request.task.value
        guard session == currentSession else { throw CancellationError() }
        memory.setObject(data as NSData, forKey: resource.key as NSString, cost: data.count)
        return data
    }
}

extension AuthStore {
    func voiceAudio(_ resource: VoiceAudioResource) async throws -> Data {
        guard state == .signedIn else { throw CancellationError() }
        return try await images.audio.data(resource) {
            try await self.withSession { api, token in
                switch resource {
                case let .userVoice(id, turn):
                    return try await api.chatAttachment(contactID: id, turnID: turn, token: token)
                case let .contactVoice(id, turn, part):
                    return try await api.chatAttachment(contactID: id, turnID: turn, assistant: true, part: part, token: token)
                case let .groupVoice(id, message):
                    return try await api.groupAttachment(groupID: id, messageID: message, token: token)
                case let .voicePreview(id):
                    return try await api.send(path: "voices/\(id)/preview", token: token, timeout: 60).0
                }
            }
        }
    }
}
