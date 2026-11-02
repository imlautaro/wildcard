import CryptoKit
import Foundation
import ImageIO
import UIKit

enum CachedImageResource: Hashable, Sendable {
    case contactAvatar(contactID: String, version: String)
    case accountAvatar(version: String)
    case groupAvatar(groupID: String, version: String)
    case groupMemberAvatar(groupID: String, kind: String, memberID: String, version: String)
    /// `image` selects one image of a contact-generated album (docs/generated-images.md#albums);
    /// 0 is the message's first or only image and keeps the original key.
    case groupAttachment(groupID: String, messageID: String, image: Int = 0)
    /// `part` selects one message of a multi-message contact reply (stickers follow the text as their own message);
    /// 0 keeps the original key.
    case assistantAttachment(contactID: String, turnID: String, image: Int = 0, part: Int = 0)
    case attachment(contactID: String, turnID: String)
    case linkPreview(hash: String, version: Int)
    /// A sticker of the person's library (docs/stickers.md#ios); immutable per `digest`.
    case sticker(id: String, digest: String)
    /// A sticker of a contact's library as shown in the contact tab of the picker.
    case contactSticker(contactID: String, stickerID: String, digest: String)

    var key: String {
        switch self {
        case let .contactAvatar(id, version): return "contact/\(id)/avatar/\(version)"
        case let .accountAvatar(version): return "account/avatar/\(version)"
        case let .groupAvatar(id, version): return "group/\(id)/avatar/\(version)"
        case let .groupMemberAvatar(group, kind, member, version): return "group/\(group)/member/\(kind)/\(member)/avatar/\(version)"
        case let .groupAttachment(id, message, image): return "group/\(id)/attachment/\(message)\(image > 0 ? "/image/\(image)" : "")"
        case let .assistantAttachment(id, turn, image, part): return "contact/\(id)/assistant-attachment/\(turn)\(part > 0 ? "/part/\(part)" : "")\(image > 0 ? "/image/\(image)" : "")"
        case let .attachment(id, turn): return "contact/\(id)/attachment/\(turn)"
        case let .linkPreview(hash, version): return "link/\(hash)/\(version)"
        case let .sticker(id, digest): return "sticker/\(id)/\(digest)"
        case let .contactSticker(contactID, stickerID, digest): return "contact/\(contactID)/sticker/\(stickerID)/\(digest)"
        }
    }
}

/// Account-scoped, bounded application cache; never uses URLSession's HTTP cache.
@MainActor
final class PrivateImageCache {
    private let decoded = NSCache<NSString, UIImage>()
    private let originals = NSCache<NSString, NSData>()
    private let disk = ProtectedDiskCache(directory: "PrivateImages-v1")
    /// Voice message audio shares this cache's account lifecycle, so every activation,
    /// sign-out, account switch and access-loss clear also drops cached audio.
    let audio = VoiceAudioCache()
    /// Link card metadata shares the same account lifecycle (docs/link-previews.md).
    let linkPreviews = LinkPreviewCache()
    private var userID: String?
    private var session = UUID()
    private struct Request {
        let id = UUID()
        let task: Task<Data, Error>
    }
    private var requests: [String: Request] = [:]

    init() {
        decoded.totalCostLimit = 32 * 1024 * 1024
        originals.totalCostLimit = 16 * 1024 * 1024
    }

    func activate(userID: String) {
        audio.activate(userID: userID)
        linkPreviews.activate(userID: userID)
        guard self.userID != userID else { return }
        resetMemory()
        self.userID = userID
    }

    func clear(deactivate: Bool = true) async {
        let previousUser = userID
        let previousSession = session
        resetMemory()
        if deactivate { userID = nil }
        linkPreviews.clear(deactivate: deactivate)
        await audio.clear(deactivate: deactivate)
        await disk.clear(userID: previousUser, session: previousSession)
    }

    private func resetMemory() {
        session = UUID()
        for request in requests.values { request.task.cancel() }
        requests.removeAll()
        decoded.removeAllObjects()
        originals.removeAllObjects()
    }

    func cachedImage(_ resource: CachedImageResource, maxPixelSize: Int) -> UIImage? {
        guard userID != nil else { return nil }
        return decoded.object(forKey: "\(resource.key)/\(maxPixelSize)" as NSString)
    }

    func store(_ data: Data, for resource: CachedImageResource) async {
        guard let userID else { return }
        let currentSession = session
        originals.setObject(data as NSData, forKey: resource.key as NSString, cost: data.count)
        await disk.write(data, userID: userID, key: resource.key, session: currentSession)
    }

    /// Re-keys already cached bytes under another resource, so a message that was sent from a library sticker
    /// keeps showing the picture it displayed while sending, without another download.
    func copy(_ source: CachedImageResource, to destination: CachedImageResource) async {
        guard let userID else { return }
        let currentSession = session
        var data = (originals.object(forKey: source.key as NSString)).map { $0 as Data }
        if data == nil { data = await disk.read(userID: userID, key: source.key, session: currentSession) }
        guard let data, session == currentSession else { return }
        await store(data, for: destination)
    }

    func image(_ resource: CachedImageResource, maxPixelSize: Int,
               fetch: @escaping @MainActor () async throws -> Data) async throws -> UIImage {
        guard let userID else { throw CancellationError() }
        if let image = cachedImage(resource, maxPixelSize: maxPixelSize) { return image }
        let currentSession = session
        let data: Data
        if let bytes = originals.object(forKey: resource.key as NSString) { data = bytes as Data }
        else {
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
            data = try await request.task.value
            guard session == currentSession else { throw CancellationError() }
            originals.setObject(data as NSData, forKey: resource.key as NSString, cost: data.count)
        }
        try Task.checkCancellation()
        let image = await Task.detached(priority: .userInitiated) {
            Self.decode(data, maxPixelSize: maxPixelSize)
        }.value
        try Task.checkCancellation()
        guard session == currentSession else { throw CancellationError() }
        guard let image else {
            originals.removeObject(forKey: resource.key as NSString)
            await disk.remove(userID: userID, key: resource.key)
            throw AuthAPI.Failure.rejected(String(localized: "This image could not be displayed. Please try again."))
        }
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? maxPixelSize * maxPixelSize * 4
        // Large fullscreen images are retained by their viewer, not the thumbnail cache.
        if maxPixelSize <= 520 {
            decoded.setObject(image, forKey: "\(resource.key)/\(maxPixelSize)" as NSString, cost: cost)
        }
        return image
    }

    nonisolated static func decode(_ data: Data, maxPixelSize: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
                kCGImageSourceShouldCacheImmediately: true,
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}

/// Account-scoped disk cache with complete file protection, a 64 MiB budget per account
/// and seven-day idle expiry. Private images and voice audio use separate directories.
actor ProtectedDiskCache {
    private let limit = 64 * 1024 * 1024
    private let lifetime: TimeInterval = 7 * 24 * 60 * 60
    private var invalidSessions: Set<UUID> = []
    private var lastPruned: [String: Date] = [:]
    private let root: URL?

    init(directory: String) {
        root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appending(path: directory, directoryHint: .isDirectory)
    }

    private func hash(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private func folder(_ userID: String) -> URL? { root?.appending(path: hash(userID), directoryHint: .isDirectory) }
    private func file(_ userID: String, _ key: String) -> URL? { folder(userID)?.appending(path: hash(key)) }

    func read(userID: String, key: String, session: UUID) -> Data? {
        guard !invalidSessions.contains(session), let file = file(userID, key) else { return nil }
        prune(userID: userID, force: false)
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
              let date = attributes[.modificationDate] as? Date,
              Date.now.timeIntervalSince(date) < lifetime,
              let data = try? Data(contentsOf: file) else { return nil }
        try? FileManager.default.setAttributes([.modificationDate: Date.now], ofItemAtPath: file.path)
        return data
    }

    func write(_ data: Data, userID: String, key: String, session: UUID) {
        guard !invalidSessions.contains(session), !Task.isCancelled, data.count <= DraftAttachment.limit,
              let root, var folder = folder(userID), let file = file(userID, key) else { return }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                                                   attributes: [.protectionKey: FileProtectionType.complete])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var cacheRoot = root
            try cacheRoot.setResourceValues(values)
            try folder.setResourceValues(values)
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            prune(userID: userID, force: true)
        } catch { /* Cache failures never fail a download. */ }
    }

    func remove(userID: String, key: String) {
        if let file = file(userID, key) { try? FileManager.default.removeItem(at: file) }
    }

    func clear(userID: String?, session: UUID) {
        invalidSessions.insert(session)
        if let userID {
            if let folder = folder(userID) { try? FileManager.default.removeItem(at: folder) }
            lastPruned.removeValue(forKey: userID)
        } else if let root {
            // A rejected cold-start session has not yet revealed its account ID.
            try? FileManager.default.removeItem(at: root)
            lastPruned.removeAll()
        }
    }

    private func prune(userID: String, force: Bool) {
        if !force, let previous = lastPruned[userID], Date.now.timeIntervalSince(previous) < 60 { return }
        lastPruned[userID] = .now
        guard let folder = folder(userID), let urls = try? FileManager.default.contentsOfDirectory(
            at: folder, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]
        ) else { return }
        var entries: [(url: URL, date: Date, size: Int)] = []
        for url in urls {
            guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let date = values.contentModificationDate, let size = values.fileSize else { continue }
            if Date.now.timeIntervalSince(date) >= lifetime { try? FileManager.default.removeItem(at: url) }
            else { entries.append((url, date, size)) }
        }
        var total = entries.reduce(0) { $0 + $1.size }
        for entry in entries.sorted(by: { $0.date < $1.date }) where total > limit {
            try? FileManager.default.removeItem(at: entry.url)
            total -= entry.size
        }
    }
}

extension AuthStore {
    func cachedImage(_ resource: CachedImageResource, maxPixelSize: Int) async throws -> UIImage {
        guard state == .signedIn else { throw CancellationError() }
        return try await images.image(resource, maxPixelSize: maxPixelSize) {
            try await self.withSession { api, token in
                switch resource {
                case let .contactAvatar(id, version): return try await api.contactPhoto(id: id, version: version, token: token)
                case let .accountAvatar(version): return try await api.profilePhoto(version: version, token: token)
                case let .groupAvatar(id, version): return try await api.groupPhoto(id: id, version: version, token: token)
                case let .groupMemberAvatar(group, kind, member, _):
                    return try await api.send(path: "groups/\(group)/photos/\(kind)/\(member)", token: token).0
                case let .groupAttachment(id, message, image): return try await api.groupAttachment(groupID: id, messageID: message, image: image, token: token)
                case let .assistantAttachment(id, turn, image, part): return try await api.chatAttachment(contactID: id, turnID: turn, assistant: true, part: part > 0 ? part : nil, image: image, token: token)
                case let .attachment(id, turn): return try await api.chatAttachment(contactID: id, turnID: turn, token: token)
                case let .linkPreview(hash, _): return try await api.send(path: "link-previews/\(hash)/image", token: token).0
                case let .sticker(id, _): return try await api.stickerImage(id: id, token: token)
                case let .contactSticker(contactID, stickerID, _): return try await api.contactStickerImage(contactID: contactID, stickerID: stickerID, token: token)
                }
            }
        }
    }
}
