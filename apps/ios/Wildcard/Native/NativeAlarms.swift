import Foundation
import AlarmKit
import ActivityKit

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
        guard AlarmManager.shared.authorizationState == .authorized else { alarmStateAvailable = false; return }
        do {
            let alarms = try AlarmManager.shared.alarms
            let active = Set(alarms.map { $0.id.uuidString.lowercased() })
            let previous = Self.alarmRecords()
            let records = previous.filter { active.contains($0.id) || schedulingAlarms.contains($0.id) }
            if records.count != previous.count { try Self.saveAlarms(records) }
            localAlarms = records.filter { $0.userID == userID }
            alarmStateAvailable = true
            let ownIDs = Set(localAlarms.map(\.id))
            systemAlarms = Dictionary(uniqueKeysWithValues: alarms.filter { ownIDs.contains($0.id.uuidString.lowercased()) }.map { ($0.id.uuidString.lowercased(), $0) })
        } catch { alarmStateAvailable = false /* Preserve known IDs on an unavailable or locked store. */ }
    }
    func observeAlarmChanges() async {
        refreshLocalAlarms()
        for await _ in AlarmManager.shared.alarmUpdates {
            guard !Task.isCancelled else { return }
            refreshLocalAlarms()
        }
    }
    func controlLocalAlarm(_ record: NativeLocalAlarm, pause: Bool) {
        guard record.userID == userID, busy.isEmpty, let id = UUID(uuidString: record.id) else { return }
        do {
            if pause { try AlarmManager.shared.pause(id: id) }
            else { try AlarmManager.shared.resume(id: id) }
            refreshLocalAlarms()
        } catch { self.error = "Unable to update this timer: \(error.localizedDescription)" }
    }
    func cancelLocalAlarm(_ record: NativeLocalAlarm) {
        guard record.userID == userID, busy.isEmpty, let id = UUID(uuidString: record.id) else { return }
        do {
            try AlarmManager.shared.cancel(id: id)
            try Self.saveAlarms(Self.alarmRecords().filter { $0.id != record.id })
            localAlarms.removeAll { $0.id == record.id }
            systemAlarms.removeValue(forKey: record.id)
        } catch { self.error = "Unable to confirm cancellation: \(error.localizedDescription)" }
    }
}
