import Foundation
import AlarmKit

nonisolated struct NativeLocalAlarm: Codable, Identifiable, Sendable {
    let id: String
    let userID: String
    let contactID: String
    let title: String
}
@MainActor extension NativeExperiments {
    private static var alarmFile: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NativeExperiments/alarms.json")
    }
    static func alarmRecords() -> [NativeLocalAlarm] {
        NativeShared.read([NativeLocalAlarm].self, from: alarmFile) ?? []
    }
    private static func saveAlarms(_ records: [NativeLocalAlarm]) throws {
        try FileManager.default.createDirectory(at: alarmFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try NativeShared.write(records, to: alarmFile)
    }
    func rememberAlarm(_ record: NativeLocalAlarm) throws {
        let active = Set(try AlarmManager.shared.alarms.map { $0.id.uuidString.lowercased() })
        var records = Self.alarmRecords().filter { active.contains($0.id) }
        guard records.count < 200 else { throw AuthAPI.Failure.rejected("Remove earlier Wildcard alarms before scheduling more.") }
        records.removeAll { $0.id == record.id }; records.append(record)
        try Self.saveAlarms(records)
        localAlarms = records.filter { $0.userID == userID }
    }
    func refreshLocalAlarms() {
        guard AlarmManager.shared.authorizationState == .authorized, busy.isEmpty else { return }
        do {
            let active = Set(try AlarmManager.shared.alarms.map { $0.id.uuidString.lowercased() })
            let previous = Self.alarmRecords()
            let records = previous.filter { active.contains($0.id) }
            if records.count != previous.count { try Self.saveAlarms(records) }
            localAlarms = records.filter { $0.userID == userID }
        } catch { /* Preserve known IDs on an unavailable or locked store. */ }
    }
    func cancelLocalAlarm(_ record: NativeLocalAlarm) {
        guard record.userID == userID, busy.isEmpty, let id = UUID(uuidString: record.id) else { return }
        do {
            try AlarmManager.shared.cancel(id: id)
            try Self.saveAlarms(Self.alarmRecords().filter { $0.id != record.id })
            localAlarms.removeAll { $0.id == record.id }
        } catch { self.error = "Unable to confirm cancellation: \(error.localizedDescription)" }
    }
}
