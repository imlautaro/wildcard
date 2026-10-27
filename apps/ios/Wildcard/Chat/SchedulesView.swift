import SwiftUI

struct ContactSchedule: Decodable, Identifiable, Sendable {
    enum Status: String, Decodable, Sendable { case active, completed, cancelled }
    let id: String
    let instruction: String
    let timeZone: String
    let nextAt: Double
    let intervalSeconds: Int?
    let status: Status

    var timing: String {
        let zone = TimeZone(identifier: timeZone) ?? .current
        let date = Date(timeIntervalSince1970: nextAt / 1000)
        return date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: zone))
    }

    var repetition: String {
        guard let intervalSeconds else { return "Once" }
        if intervalSeconds % 3600 == 0 {
            let hours = intervalSeconds / 3600
            return "Every \(hours) \(hours == 1 ? "hour" : "hours")"
        }
        if intervalSeconds % 60 == 0 { return "Every \(intervalSeconds / 60) minutes" }
        return "Every \(intervalSeconds) seconds"
    }
}

extension AuthAPI {
    private struct SchedulesEnvelope: Decodable { let schedules: [ContactSchedule] }

    func contactSchedules(contactID: String, token: String) async throws -> [ContactSchedule] {
        let (data, _) = try await send(path: "contacts/\(contactID)/schedules", token: token)
        return try JSONDecoder().decode(SchedulesEnvelope.self, from: data).schedules
    }

    func cancelSchedule(contactID: String, scheduleID: String, token: String) async throws {
        _ = try await send(path: "contacts/\(contactID)/schedules/\(scheduleID)", method: "DELETE", token: token)
    }
}

struct SchedulesView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase
    @State private var schedules: [ContactSchedule] = []
    @State private var loading = true
    @State private var hasLoaded = false
    @State private var refreshRevision = 0
    @State private var cancelling: Set<String> = []
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh") { Task { await refresh() } }.disabled(loading)
                }
            }
            if !hasLoaded && loading {
                ProgressView("Loading schedules…")
            } else if hasLoaded && schedules.isEmpty {
                ContentUnavailableView("No schedules", systemImage: "clock",
                    description: Text("Ask this contact to write to you at a specific time or every ten minutes."))
            }
            ForEach(schedules) { schedule in
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(schedule.instruction).manrope()
                        Text(schedule.repetition).manrope(.subheadline, weight: .semibold)
                        Text("\(schedule.status == .active ? "Next" : "Scheduled for"): \(schedule.timing)")
                            .manrope(.footnote)
                        Text(schedule.timeZone).manrope(.caption).foregroundStyle(.secondary)
                        if schedule.status == .cancelled {
                            Text("Cancelled").manrope(.footnote).foregroundStyle(.secondary)
                        } else {
                            if schedule.status == .completed {
                                Text("Triggered · check the conversation for delivery status")
                                    .manrope(.footnote).foregroundStyle(.secondary)
                            }
                            Button("Cancel schedule", role: .destructive) {
                                Task { await cancel(schedule) }
                            }
                            .disabled(cancelling.contains(schedule.id))
                        }
                    }.padding(.vertical, 4)
                }
            }
            Section {
                Text("Create or change schedules by messaging this contact. Times use the saved time zone. Messages may arrive after the scheduled time while they are generated and delivered.")
                    .manrope(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Schedules")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await refresh()
        }
    }

    private func refresh() async {
        refreshRevision += 1
        let started = refreshRevision
        loading = true
        defer { if started == refreshRevision { loading = false } }
        do {
            let updated = try await auth.withSession { api, token in
                try await api.contactSchedules(contactID: contactID, token: token)
            }
            try Task.checkCancellation()
            guard started == refreshRevision else { return }
            schedules = updated
            hasLoaded = true
            error = nil
        } catch is CancellationError { }
        catch { if started == refreshRevision { self.error = error.localizedDescription } }
    }

    private func cancel(_ schedule: ContactSchedule) async {
        guard cancelling.insert(schedule.id).inserted else { return }
        refreshRevision += 1
        loading = false
        defer { cancelling.remove(schedule.id) }
        do {
            try await auth.withSession { api, token in
                try await api.cancelSchedule(contactID: contactID, scheduleID: schedule.id, token: token)
            }
            await refresh()
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
