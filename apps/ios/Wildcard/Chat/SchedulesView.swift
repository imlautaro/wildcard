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
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    let cache: NavigationSnapshot<[ContactSchedule]>
    private var schedules: [ContactSchedule] { cache.value ?? [] }
    @State private var loading = true
    private var hasLoaded: Bool { cache.value != nil }
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
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: schedule.status == .active ? "clock" : schedule.status == .cancelled ? "clock.badge.xmark" : "clock.badge.checkmark")
                        .foregroundStyle(schedule.status == .active ? Color.accentColor : .secondary)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(schedule.instruction).manrope().lineLimit(3)
                        Text("\(schedule.repetition) · \(schedule.status == .active ? "Next" : "Scheduled for") \(schedule.timing)")
                            .manrope(.footnote).foregroundStyle(.secondary)
                        if schedule.status == .cancelled {
                            Text("Cancelled").manrope(.caption).foregroundStyle(.secondary)
                        } else if schedule.status == .completed {
                            Text("Dispatched · check the conversation").manrope(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    if cancelling.contains(schedule.id) { ProgressView() }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                .swipeActions {
                    if schedule.status != .cancelled {
                        Button("Cancel", role: .destructive) { Task { await cancel(schedule) } }
                            .disabled(cancelling.contains(schedule.id))
                    }
                }
                .contextMenu {
                    if schedule.status != .cancelled {
                        Button("Cancel schedule", systemImage: "xmark.circle", role: .destructive) { Task { await cancel(schedule) } }
                            .disabled(cancelling.contains(schedule.id))
                    }
                    Text(schedule.timeZone)
                }
                .accessibilityAction(named: "Cancel schedule") {
                    if schedule.status != .cancelled { Task { await cancel(schedule) } }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                InfoButton(title: "Schedules", text: "Create or change schedules by messaging this contact. Swipe a schedule or hold it to cancel. Times use the saved time zone. Messages may arrive after the scheduled time while they are generated and delivered.")
            }
        }
        .navigationTitle("Schedules")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) }
                catch { return }
                guard !Task.isCancelled else { return }
                if !loading && cancelling.isEmpty { await refresh() }
            }
        }
    }

    private func refresh() async {
        refreshRevision += 1
        let started = refreshRevision
        loading = true
        defer { if started == refreshRevision { loading = false } }
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    try await api.contactSchedules(contactID: contactID, token: token)
                }
            }
            try Task.checkCancellation()
            guard started == refreshRevision else { return }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            contacts.scheduleSnapshots.remove(id: contactID)
            self.error = "This contact is no longer available."
        }
        catch { if started == refreshRevision { self.error = error.localizedDescription } }
    }

    private func cancel(_ schedule: ContactSchedule) async {
        guard cancelling.insert(schedule.id).inserted else { return }
        refreshRevision += 1
        cache.invalidate()
        loading = false
        defer { cancelling.remove(schedule.id) }
        do {
            try await auth.withSession { api, token in
                try await api.cancelSchedule(contactID: contactID, scheduleID: schedule.id, token: token)
            }
            cache.invalidate()
            await refresh()
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
