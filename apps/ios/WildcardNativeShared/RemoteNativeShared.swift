import Foundation

// The notification extension receives only a one-action capability, never the account session.
nonisolated struct RemoteNativeConfiguration: Codable, Equatable, Sendable {
    let userID: String
    let deviceID: String
    var contacts: [String: [String]]
}
nonisolated struct RemoteNativeAlarm: Codable, Sendable {
    let id: String
    let userID: String
    let contactID: String
    let title: String
    let fireAt: Double
    let createdAt: Double
}
nonisolated enum RemoteNativeShared {
    static var configurationFile: URL? { NativeShared.container?.appendingPathComponent("remote-control.json") }
    static var configuration: RemoteNativeConfiguration? { NativeShared.read(RemoteNativeConfiguration.self, from: configurationFile) }
    static func writeConfiguration(_ configuration: RemoteNativeConfiguration?) throws {
        guard let file = configurationFile else { throw CocoaError(.fileNoSuchFile) }
        if let configuration {
            try JSONEncoder().encode(configuration).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } else if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
    static var alarmFolder: URL? { NativeShared.container?.appendingPathComponent("RemoteAlarms", isDirectory: true) }
    static func remember(_ alarm: RemoteNativeAlarm) throws {
        guard let folder = alarmFolder, UUID(uuidString: alarm.id) != nil else { throw CocoaError(.fileWriteNoPermission) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        guard (try FileManager.default.contentsOfDirectory(atPath: folder.path)).count < 200 else { throw CocoaError(.fileWriteOutOfSpace) }
        try JSONEncoder().encode(alarm).write(to: folder.appendingPathComponent(alarm.id + ".json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func alarms() -> [RemoteNativeAlarm] {
        guard let folder = alarmFolder, let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return [] }
        return files.prefix(200).compactMap { NativeShared.read(RemoteNativeAlarm.self, from: $0) }
    }
    static func removeAlarm(_ id: String) {
        guard UUID(uuidString: id) != nil, let folder = alarmFolder else { return }
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(id + ".json"))
    }
}
