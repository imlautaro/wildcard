import Foundation
import ActivityKit

// Shared storage contains only explicitly exposed contact identities and draft inputs.
// Authentication credentials never leave the main app's Keychain.
nonisolated struct NativeContactIdentity: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let agentID: String
}
nonisolated struct NativeDirectory: Codable, Equatable, Sendable {
    let userID: String
    let contacts: [NativeContactIdentity]
}
nonisolated struct NativeDraft: Codable, Identifiable, Sendable {
    var id: String = UUID().uuidString.lowercased()
    let userID: String
    let contactID: String
    let text: String
    var data: Data? = nil
    var mimeType: String? = nil
    var filename: String? = nil
    var createdAt: Date = .now
}
nonisolated enum NativeShared {
    static var groupID: String { Bundle.main.object(forInfoDictionaryKey: "WildcardAppGroup") as? String ?? "group.com.imlautaro.Wildcard" }
    static var linkHost: String { Bundle.main.object(forInfoDictionaryKey: "WildcardLinkHost") as? String ?? "wildcard-web.imlautaro.workers.dev" }
    static var container: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) }
    static func write<T: Encodable>(_ value: T, to url: URL) throws {
        try JSONEncoder().encode(value).write(to: url, options: [.atomic, .completeFileProtection])
    }
    static func read<T: Decodable>(_ type: T.Type, from url: URL?) -> T? {
        guard let url, let bytes = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: bytes)
    }
    static var directory: NativeDirectory? { read(NativeDirectory.self, from: container?.appendingPathComponent("contacts.json")) }
    static func publish(_ directory: NativeDirectory?) throws {
        guard let root = container else { throw CocoaError(.fileNoSuchFile) }
        let file = root.appendingPathComponent("contacts.json")
        if let directory { try write(directory, to: file) }
        else if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
    static func enqueue(_ draft: NativeDraft) throws {
        guard let root = container, directory?.userID == draft.userID,
              directory?.contacts.contains(where: { $0.id == draft.contactID }) == true,
              draft.text.count <= 4000, (draft.data?.count ?? 0) <= 5 * 1024 * 1024 else { throw CocoaError(.fileWriteNoPermission) }
        let inbox = root.appendingPathComponent("Inbox", isDirectory: true)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let old = try FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil)
        for file in old {
            if let item = read(NativeDraft.self, from: file), Date.now.timeIntervalSince(item.createdAt) > 86400 { try? FileManager.default.removeItem(at: file) }
        }
        guard (try FileManager.default.contentsOfDirectory(atPath: inbox.path)).count < 10 else { throw CocoaError(.fileWriteOutOfSpace) }
        try write(draft, to: inbox.appendingPathComponent("\(draft.id).json"))
    }
    static func drafts(userID: String) -> [NativeDraft] {
        guard let inbox = container?.appendingPathComponent("Inbox"),
              let files = try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil) else { return [] }
        return files.compactMap { read(NativeDraft.self, from: $0) }.filter { $0.userID == userID && Date.now.timeIntervalSince($0.createdAt) < 86400 }.sorted { $0.createdAt < $1.createdAt }
    }
    static func removeDraft(_ id: String) {
        guard UUID(uuidString: id) != nil else { return }
        if let file = container?.appendingPathComponent("Inbox/\(id).json") { try? FileManager.default.removeItem(at: file) }
    }
    static func clear() {
        try? publish(nil)
        if let inbox = container?.appendingPathComponent("Inbox") { try? FileManager.default.removeItem(at: inbox) }
    }
    static func link(agentID: String) -> URL {
        var url = URLComponents()
        url.scheme = "https"; url.host = linkHost; url.path = "/native/contact"
        url.queryItems = [URLQueryItem(name: "agentID", value: agentID)]
        return url.url!
    }
}

nonisolated struct ContactSessionAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable {
        var step: Int = 0
        var endDate: Date?
        var pausedRemaining: Double?
        var finished = false
    }
    let actionID: String
    let userID: String
    let contactID: String
    let contactName: String
    let title: String
    let kind: String
    let steps: [String]
    let startedAt: Date
    var expiresAt: Date { startedAt.addingTimeInterval(8 * 3600) }
}

import AlarmKit
nonisolated struct WildcardAlarmMetadata: AlarmMetadata { let contactID: String }
