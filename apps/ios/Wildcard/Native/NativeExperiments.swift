import SwiftUI
import Observation
import ActivityKit
import AlarmKit
import AVFAudio
import EventKit
import CoreLocation
import Security
import WidgetKit
import AppIntents

@Observable @MainActor
final class NativeExperiments {
    static let shared = NativeExperiments()
    static let kinds = ["focus", "recipe", "timer", "alarm", "calendar", "reminder", "location_reminder", "speech"]
    static let automaticKinds: Set<String> = ["timer", "alarm", "focus", "recipe", "reminder", "speech"]
    var remoteEnabled: Set<String> = []
    var remoteBusy = false
    private(set) var automaticSince: [String: [String: Double]] = [:]
    private var automaticAttempts: Set<String> = []
    static let labels = ["focus": "Focus sessions", "recipe": "Guided recipes", "timer": "Timers", "alarm": "Alarms", "calendar": "Calendar events", "reminder": "Reminders", "location_reminder": "Location reminders", "speech": "Spoken responses"]
    private(set) var userID: String?
    private(set) var enabled: [String: Set<String>] = [:]
    private(set) var actions: [String: [NativeAction]] = [:]
    private(set) var busy: Set<String> = []
    private(set) var drafts: [NativeDraft] = []
    var selectedDraft: NativeDraft?
    var error: String?
    var calendarRequest: CalendarRequest?
    var locationRequest: LocationRequest?
    var route: NativeRoute?
    private var knownContacts: [Contact] = []
    private var loaded: [String: Date] = [:]
    private var requests: [String: Task<Void, Never>] = [:]
    private var generation = UUID()
    private let speaker = NativeSpeaker()
    private(set) var speaking = false
    private(set) var speakingContactID: String?
    private(set) var schedulingAlarms: Set<String> = []
    var alarmStateAvailable = false
    var localAlarms: [NativeLocalAlarm] = []
    var systemAlarms: [String: Alarm] = [:]
    private var eventStore = EKEventStore()
    private var device: String?
    struct CalendarRequest: Identifiable { let id = UUID(); let event: EKEvent; let store: EKEventStore; let complete: (String) -> Void }
    struct LocationRequest: Identifiable { let id = UUID(); let complete: (Double, Double) -> Void }
    struct NativeRoute: Identifiable { let id = UUID(); let contactID: String?; let agentID: String?; var draftID: String? = nil }

    private func settingsKey(_ userID: String) -> String { "native-experiments.\(userID)" }
    func activate(userID: String, contacts: [Contact]) {
        if self.userID != userID {
            clear(preservingInboxFor: userID)
            self.userID = userID
            let values = UserDefaults.standard.dictionary(forKey: settingsKey(userID)) as? [String: [String]] ?? [:]
            enabled = values.mapValues { Set($0).intersection(Self.kinds) }
            remoteEnabled = Set(UserDefaults.standard.stringArray(forKey: "native-remote.\(userID)") ?? [])
            if let saved = UserDefaults.standard.dictionary(forKey: "automatic-" + settingsKey(userID)) as? [String: [String: Double]] {
                automaticSince = saved
            } else {
                let now = Date.now.timeIntervalSince1970 * 1000
                automaticSince = enabled.mapValues { kinds in
                    Dictionary(uniqueKeysWithValues: kinds.intersection(["timer", "alarm"]).map { ($0, now) })
                }
                saveAutomaticSettings()
            }
        }
        knownContacts = contacts
        localAlarms = Self.alarmRecords().filter { $0.userID == userID }
        publish()
        drafts = NativeShared.drafts(userID: userID)
        publishRemoteSettings()
    }
    func clear(preservingInboxFor owner: String? = nil) {
        try? RemoteNativeShared.writeConfiguration(nil)
        remoteEnabled = []; remoteBusy = false
        generation = UUID()
        requests.values.forEach { $0.cancel() }; requests = [:]
        automaticSince = [:]; automaticAttempts = []
        actions = [:]; loaded = [:]; enabled = [:]; knownContacts = []; drafts = []; selectedDraft = nil
        calendarRequest?.complete("cancelled"); calendarRequest = nil
        locationRequest?.complete(.nan, .nan); locationRequest = nil
        speaker.stop(); speaking = false; speakingContactID = nil
        busy = []; schedulingAlarms = []; alarmStateAvailable = false; localAlarms = []; systemAlarms = [:]; userID = nil; error = nil
        if owner == nil || NativeShared.directory?.userID != owner { NativeShared.clear() }
        WidgetCenter.shared.reloadAllTimelines()
        let oldActivities = Activity<ContactSessionAttributes>.activities.filter { $0.attributes.userID != owner }
        Task {
            for activity in oldActivities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
    func forget(contactID: String) {
        remoteEnabled.remove(contactID)
        if let userID { UserDefaults.standard.set(Array(remoteEnabled).sorted(), forKey: "native-remote.\(userID)") }
        publishRemoteSettings()
        automaticSince.removeValue(forKey: contactID); saveAutomaticSettings()
        enabled.removeValue(forKey: contactID); actions.removeValue(forKey: contactID); loaded.removeValue(forKey: contactID)
        requests.removeValue(forKey: contactID)?.cancel()
        knownContacts.removeAll { $0.id == contactID }
        if let userID { UserDefaults.standard.set(enabled.mapValues { Array($0).sorted() }, forKey: settingsKey(userID)) }
        for draft in drafts where draft.contactID == contactID { NativeShared.removeDraft(draft.id) }
        drafts.removeAll { $0.contactID == contactID }
        publish()
        Task {
            for activity in Activity<ContactSessionAttributes>.activities where activity.attributes.contactID == contactID {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
    func setKinds(_ kinds: Set<String>, contactID: String) {
        guard let userID else { return }
        let previous = enabled[contactID] ?? []
        enabled[contactID] = kinds.intersection(Self.kinds)
        var automatic = (automaticSince[contactID] ?? [:]).filter { kinds.contains($0.key) }
        for kind in kinds.subtracting(previous).intersection(["timer", "alarm"]) {
            automatic[kind] = Date.now.timeIntervalSince1970 * 1000
        }
        automaticSince[contactID] = automatic
        saveAutomaticSettings()
        publishRemoteSettings()
        UserDefaults.standard.set(enabled.mapValues { Array($0).sorted() }, forKey: settingsKey(userID))
        publish()
        if kinds.isEmpty {
            Task {
                for activity in Activity<ContactSessionAttributes>.activities where activity.attributes.contactID == contactID {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }
    private func saveAutomaticSettings() {
        guard let userID else { return }
        UserDefaults.standard.set(automaticSince, forKey: "automatic-" + settingsKey(userID))
    }
    func setAutomatic(_ on: Bool, kind: String, contactID: String) {
        guard userID != nil, Self.automaticKinds.contains(kind), enabled[contactID]?.contains(kind) == true else { return }
        if on { automaticSince[contactID, default: [:]][kind] = Date.now.timeIntervalSince1970 * 1000 }
        else { automaticSince[contactID]?.removeValue(forKey: kind) }
        saveAutomaticSettings()
    }
    func runAutomatically(using auth: AuthStore) async {
        let current = generation
        for contactID in enabled.keys.sorted() where !(automaticSince[contactID] ?? [:]).isEmpty {
            guard !Task.isCancelled, generation == current, UIApplication.shared.applicationState == .active else { return }
            await refresh(contactID: contactID, using: auth)
            for action in (actions[contactID] ?? []).sorted(by: { $0.createdAt < $1.createdAt }) {
                guard !Task.isCancelled, generation == current, UIApplication.shared.applicationState == .active else { return }
                guard action.remoteDeviceID == nil, busy.isEmpty, action.status == "pending", action.expiresAt > Date.now.timeIntervalSince1970 * 1000,
                      let since = automaticSince[contactID]?[action.kind], action.createdAt >= since,
                      !automaticAttempts.contains(action.id) else { continue }
                // An uncertain claim or acknowledgement must never trigger another automatic attempt.
                automaticAttempts.insert(action.id)
                await run(action, contactID: contactID, using: auth, automatically: true)
            }
        }
    }
    private func publish() {
        guard let userID else { return }
        let identities = knownContacts.filter { !(enabled[$0.id] ?? []).isEmpty }.map {
            NativeContactIdentity(id: $0.id, name: $0.name, agentID: $0.agentID ?? $0.id)
        }
        let directory = NativeDirectory(userID: userID, contacts: identities)
        guard NativeShared.directory != directory else { return }
        do { try NativeShared.publish(directory); WildcardShortcuts.updateAppShortcutParameters(); error = nil }
        catch { self.error = "System integrations are unavailable. Check App Group signing in Xcode." }
        WidgetCenter.shared.reloadAllTimelines()
    }
    func deviceID() throws -> String {
        if let device { return device }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: "\(Bundle.main.bundleIdentifier ?? "Wildcard").native-device",
                                   kSecAttrAccount as String: "installation"]
        var request = query; request[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecSuccess, let bytes = item as? Data, let id = String(data: bytes, encoding: .utf8), UUID(uuidString: id) != nil { device = id; return id }
        guard status == errSecItemNotFound else { throw AuthAPI.Failure.rejected("Unlock your iPhone to use native tools.") }
        let id = UUID().uuidString.lowercased()
        var entry = query; entry[kSecValueData as String] = Data(id.utf8); entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw AuthAPI.Failure.rejected("Unable to register this device for native tools.") }
        device = id
        return id
    }
    func context(contactID: String) throws -> NativeContext? {
        let kinds = enabled[contactID] ?? []
        guard !kinds.isEmpty else { return nil }
        return NativeContext(deviceID: try deviceID(), kinds: kinds.sorted(), automaticKinds: kinds.intersection(Set((automaticSince[contactID] ?? [:]).keys)).sorted())
    }
    func refresh(contactID: String, using auth: AuthStore, force: Bool = false) async {
        guard let owner = userID, owner == auth.user?.id, !(enabled[contactID] ?? []).isEmpty else { return }
        if let task = requests[contactID] { await task.value; return }
        if !force, let date = loaded[contactID], Date.now.timeIntervalSince(date) < 5 { return }
        let current = generation
        let task = Task { @MainActor in
            do {
                let device = try deviceID()
                let values = try await auth.withSession { api, token in try await api.nativeActions(contactID: contactID, deviceID: device, token: token) }
                guard generation == current, userID == owner, !Task.isCancelled else { return }
                if actions.count >= 20, actions[contactID] == nil, let oldest = loaded.min(by: { $0.value < $1.value })?.key {
                    actions.removeValue(forKey: oldest); loaded.removeValue(forKey: oldest)
                }
                actions[contactID] = values; loaded[contactID] = .now
            } catch is CancellationError { }
            catch {
                guard generation == current else { return }
                if case AuthAPI.Failure.notFound = error { forget(contactID: contactID) }
                if case AuthAPI.Failure.rejected(let message) = error { self.error = message }
                else { self.error = error.localizedDescription }
            }
        }
        requests[contactID] = task
        await task.value
        if generation == current { requests.removeValue(forKey: contactID) }
    }
    private func update(_ action: NativeAction, contactID: String) {
        if let index = actions[contactID]?.firstIndex(where: { $0.id == action.id }) { actions[contactID]?[index] = action }
    }
    private func allowsAutomatic(_ action: NativeAction, contactID: String) -> Bool {
        guard let since = automaticSince[contactID]?[action.kind] else { return false }
        return action.createdAt >= since
    }
    func run(_ action: NativeAction, contactID: String, using auth: AuthStore, automatically: Bool = false) async {
        guard action.remoteDeviceID == nil, let payload = action.payload, action.status == "pending", action.expiresAt > Date.now.timeIntervalSince1970 * 1000,
              auth.user?.id == userID, UIApplication.shared.applicationState == .active, enabled[contactID]?.contains(action.kind) == true, busy.isEmpty else { return }
        let owner = userID; let current = generation; let execution = UUID().uuidString.lowercased()
        busy.insert(action.id); error = nil
        defer { busy.remove(action.id) }
        do {
            // Revalidate access immediately before claiming. A successful claim is never replayed.
            _ = try await auth.withSession { api, token in try await api.contact(id: contactID, token: token) }
            guard generation == current, owner == userID, !Task.isCancelled,
                  UIApplication.shared.applicationState == .active, enabled[contactID]?.contains(action.kind) == true,
                  !automatically || allowsAutomatic(action, contactID: contactID) else { return }
            let device = try deviceID()
            let claimed = try await auth.withSession { api, token in
                try await api.nativeAction(contactID: contactID, actionID: action.id, deviceID: device, executionID: execution, status: "running", token: token)
            }
            guard generation == current, owner == userID else { return }
            update(claimed, contactID: contactID)
            let result: String
            do {
                if Task.isCancelled || UIApplication.shared.applicationState != .active
                    || enabled[contactID]?.contains(action.kind) != true
                    || (automatically && !allowsAutomatic(action, contactID: contactID)) { result = "cancelled" }
                else { result = try await execute(payload, actionID: action.id, executionID: execution, contactID: contactID, automatically: automatically) }
            }
            catch {
                self.error = error.localizedDescription
                if case AuthAPI.Failure.rejected = error { result = "failed" } else { result = "unknown" }
            }
            guard generation == current, owner == userID else { return }
            let finished = try await auth.withSession { api, token in
                try await api.nativeAction(contactID: contactID, actionID: action.id, deviceID: device, executionID: execution, status: result, token: token)
            }
            update(finished, contactID: contactID)
        } catch {
            guard generation == current else { return }
            self.error = "\(error.localizedDescription) If execution was interrupted, inspect the system app before asking for another action."
            await refresh(contactID: contactID, using: auth, force: true)
        }
    }
    func abandon(_ action: NativeAction, contactID: String, using auth: AuthStore) async {
        guard let execution = action.executionID, action.status == "running", !busy.contains(action.id) else { return }
        do {
            let device = try deviceID()
            let updated = try await auth.withSession { api, token in
                try await api.nativeAction(contactID: contactID, actionID: action.id, deviceID: device, executionID: execution, status: "unknown", token: token)
            }
            update(updated, contactID: contactID)
        } catch { self.error = error.localizedDescription }
    }
    func stopSpeaking() { speaker.stop() }
    private func date(_ value: String?) throws -> Date {
        guard let value else { throw AuthAPI.Failure.rejected("A date is required.") }
        let parser = ISO8601DateFormatter()
        var date = parser.date(from: value)
        if date == nil { parser.formatOptions.insert(.withFractionalSeconds); date = parser.date(from: value) }
        guard let date, date > .now else { throw AuthAPI.Failure.rejected("This date has passed. Ask for a new proposal.") }
        return date
    }
    private func execute(_ p: NativePayload, actionID: String, executionID: String, contactID: String, automatically: Bool) async throws -> String {
        guard let owner = userID else { return "cancelled" }
        switch p.kind {
        case "focus", "recipe":
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw AuthAPI.Failure.rejected("Enable Live Activities for Wildcard in Settings.") }
            guard !Activity<ContactSessionAttributes>.activities.contains(where: { $0.attributes.actionID == actionID }) else { return "completed" }
            let attributes = ContactSessionAttributes(actionID: actionID, userID: owner, contactID: contactID,
                contactName: knownContacts.first(where: { $0.id == contactID })?.name ?? "Contact", title: p.title, kind: p.kind, steps: p.steps ?? [], startedAt: .now)
            let state = ContactSessionAttributes.ContentState(endDate: p.kind == "focus" ? Date.now.addingTimeInterval(Double(p.durationSeconds ?? 1500)) : nil)
            let encodedSize = try JSONEncoder().encode(attributes).count + JSONEncoder().encode(state).count
            guard encodedSize <= 3800 else { throw AuthAPI.Failure.rejected("This activity is too large. Ask for a shorter title or fewer recipe steps.") }
            _ = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: state.endDate ?? attributes.expiresAt), pushType: nil)
            return "completed"
        case "timer", "alarm":
            guard try await AlarmManager.shared.requestAuthorization() == .authorized else { throw AuthAPI.Failure.rejected("Alarm permission was denied. Enable it in Settings.") }
            guard userID == owner, enabled[contactID]?.contains(p.kind) == true,
                  !automatically || (UIApplication.shared.applicationState == .active && automaticSince[contactID]?[p.kind] != nil) else { return "cancelled" }
            let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: p.title))
            let presentation = AlarmPresentation(alert: alert,
                countdown: p.kind == "timer" ? AlarmPresentation.Countdown(title: LocalizedStringResource(stringLiteral: p.title), pauseButton: AlarmButton(text: "Pause", textColor: .white, systemImageName: "pause.fill")) : nil,
                paused: p.kind == "timer" ? AlarmPresentation.Paused(title: LocalizedStringResource(stringLiteral: p.title), resumeButton: AlarmButton(text: "Resume", textColor: .white, systemImageName: "play.fill")) : nil)
            let attributes = AlarmAttributes(presentation: presentation, metadata: WildcardAlarmMetadata(contactID: contactID), tintColor: NativeStyle.tint(for: "alarm"))
            let configuration: AlarmManager.AlarmConfiguration<WildcardAlarmMetadata>
            if p.kind == "timer" { configuration = .timer(duration: Double(p.durationSeconds ?? 60), attributes: attributes) }
            else { configuration = .alarm(schedule: .fixed(try date(p.date)), attributes: attributes) }
            schedulingAlarms.insert(executionID)
            defer { schedulingAlarms.remove(executionID) }
            try rememberAlarm(NativeLocalAlarm(id: executionID, userID: owner, contactID: contactID, title: p.title))
            let scheduled = try await AlarmManager.shared.schedule(id: UUID(uuidString: executionID)!, configuration: configuration)
            if userID == owner {
                systemAlarms[executionID] = scheduled
                alarmStateAvailable = true
            }
            return "completed"
        case "calendar":
            let event = EKEvent(eventStore: eventStore)
            event.title = p.title; event.notes = p.body; event.startDate = try date(p.date); event.endDate = try date(p.endDate)
            return await withCheckedContinuation { continuation in
                calendarRequest = CalendarRequest(event: event, store: eventStore) { continuation.resume(returning: $0) }
            }
        case "reminder", "location_reminder":
            guard try await eventStore.requestFullAccessToReminders() else { throw AuthAPI.Failure.rejected("Allow Reminders access in Settings to save this reminder.") }
            guard userID == owner, enabled[contactID]?.contains(p.kind) == true,
                  !automatically || (UIApplication.shared.applicationState == .active && automaticSince[contactID]?[p.kind] != nil) else { return "cancelled" }
            let reminder = EKReminder(eventStore: eventStore)
            reminder.title = p.title; reminder.notes = p.body
            guard let calendar = eventStore.defaultCalendarForNewReminders() else { throw AuthAPI.Failure.rejected("Create a reminder list in Reminders first.") }
            reminder.calendar = calendar
            if let value = p.date {
                let due = try date(value)
                reminder.dueDateComponents = Calendar.current.dateComponents([.year,.month,.day,.hour,.minute,.timeZone], from: due)
                reminder.addAlarm(EKAlarm(absoluteDate: due))
            }
            if p.kind == "location_reminder" {
                let coordinates: (Double, Double)
                if let lat = p.latitude, let lon = p.longitude { coordinates = (lat, lon) }
                else {
                    coordinates = await withCheckedContinuation { continuation in
                        locationRequest = LocationRequest { continuation.resume(returning: ($0, $1)) }
                    }
                }
                guard coordinates.0.isFinite, coordinates.1.isFinite, userID == owner, enabled[contactID]?.contains(p.kind) == true else { return "cancelled" }
                let location = EKStructuredLocation(title: p.title)
                location.geoLocation = CLLocation(latitude: coordinates.0, longitude: coordinates.1)
                location.radius = p.radius ?? 200
                let alarm = EKAlarm(); alarm.structuredLocation = location
                alarm.proximity = p.trigger == "departure" ? .leave : .enter
                reminder.addAlarm(alarm)
            }
            try eventStore.save(reminder, commit: true)
            return "completed"
        case "speech":
            speaking = true; speakingContactID = contactID
            defer { speaking = false; speakingContactID = nil }
            return await speaker.speak(p.body ?? p.title)
        default: throw AuthAPI.Failure.rejected("This native action is not supported.")
        }
    }
}

@MainActor final class NativeSpeaker: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var completion: CheckedContinuation<String, Never>?
    private var active: AVSpeechUtterance?
    override init() { super.init(); synth.delegate = self }
    func speak(_ text: String) async -> String {
        stop()
        return await withCheckedContinuation { continuation in
            completion = continuation
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.language.languageCode?.identifier)
            active = utterance
            synth.speak(utterance)
        }
    }
    func stop() { active = nil; synth.stopSpeaking(at: .immediate); finish("cancelled") }
    private func finish(_ status: String) { let next = completion; completion = nil; next?.resume(returning: status) }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { Task { @MainActor in if self.active === utterance { self.active = nil; self.finish("completed") } } }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { Task { @MainActor in if self.active === utterance { self.active = nil; self.finish("cancelled") } } }
}

@MainActor extension NativeExperiments {
    func receive(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              (url.scheme == "https" && url.host == NativeShared.linkHost && url.path == "/native/contact") ||
              (url.scheme == "wildcard" && url.host == "native" && url.path == "/contact") else { return }
        let query = components.queryItems ?? []
        let contact = query.first(where: { $0.name == "contactID" })?.value
        let agent = query.first(where: { $0.name == "agentID" })?.value
        guard [contact, agent].compactMap({ $0 }).allSatisfy({ UUID(uuidString: $0) != nil }), contact != nil || agent != nil else { return }
        route = NativeRoute(contactID: contact, agentID: agent)
    }
    func dismiss(_ action: NativeAction, contactID: String, using auth: AuthStore) async {
        guard action.status == "pending", !busy.contains(action.id) else { return }
        busy.insert(action.id)
        defer { busy.remove(action.id) }
        do {
            let device = try deviceID()
            let updated = try await auth.withSession { api, token in
                try await api.nativeAction(contactID: contactID, actionID: action.id, deviceID: device,
                                           executionID: UUID().uuidString.lowercased(), status: "cancelled", token: token)
            }
            update(updated, contactID: contactID)
        } catch { self.error = error.localizedDescription }
    }
    func consumeDraft(_ id: String) {
        NativeShared.removeDraft(id); drafts.removeAll { $0.id == id }
        if selectedDraft?.id == id { selectedDraft = nil }
    }
    func reloadDrafts() { if let userID { drafts = NativeShared.drafts(userID: userID) } }
}
