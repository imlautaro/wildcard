import SwiftUI
import EventKitUI
import MapKit
import ActivityKit

struct NativeToolsView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native
    @Environment(\.scenePhase) private var scenePhase
    @State private var nfc = NativeNFC()
    @State private var confirmNFCWrite = false
    @State private var sessionRevision = 0
    private var kinds: Set<String> { native.enabled[contactID] ?? [] }
    private var contact: Contact? { contacts.contact(id: contactID) }
    var body: some View {
        Form {
            Section {
                Toggle("Enable native experiments", isOn: Binding(get: { !kinds.isEmpty }, set: {
                    native.setKinds($0 ? Set(NativeExperiments.kinds) : [], contactID: contactID)
                }))
            } footer: {
                Text("Enables this contact's name in Shortcuts, Siri, widgets and the share sheet on this device. Timers and alarms run automatically when requested in this private chat while Wildcard is open. Choose other automatic tools below. Lock Screen activities may show their titles. Other people sharing this contact receive no device access.")
            }
            if !kinds.isEmpty {
                Section("Allowed tools") {
                    ForEach(NativeExperiments.kinds, id: \.self) { kind in
                        Toggle(NativeExperiments.labels[kind] ?? kind, isOn: Binding(get: { kinds.contains(kind) }, set: { on in
                            var value = kinds
                            if on { value.insert(kind) } else { value.remove(kind) }
                            native.setKinds(value, contactID: contactID)
                        }))
                    }
                }
                Section {
                    ForEach(NativeExperiments.kinds.filter { kinds.contains($0) && NativeExperiments.automaticKinds.contains($0) }, id: \.self) { kind in
                        Toggle(NativeExperiments.labels[kind] ?? kind, isOn: Binding(
                            get: { native.automaticSince[contactID]?[kind] != nil },
                            set: { native.setAutomatic($0, kind: kind, contactID: contactID) }
                        ))
                    }
                } header: { Text("Run without confirmation") } footer: {
                    Text("Applies to new requests on this iPhone while Wildcard is open. iOS may ask for permission the first time. Calendar and location reminders still require review. Older requests remain manual.")
                }
                Section {
                    Text("Ask in chat: “Help me focus for 25 minutes”, “Guide me through a recipe”, “Set a timer for 12 minutes”, “Add an event tomorrow at 3 PM”, or “Read this aloud”.")
                    Text("Run an Open contact or Draft message shortcut from Siri, Spotlight or the Action button. Add the Contact widget to your Home Screen. Shared inputs remain drafts until you send them.")
                } header: { Text("Try it") }
                if let agent = contact?.agentID {
                    Section("Physical contact") {
                        ShareLink("Share contact link", item: NativeShared.link(agentID: agent))
                        Button("Write contact link to NFC tag") { confirmNFCWrite = true }
                            .confirmationDialog("Replace the NFC tag’s content with this contact link?", isPresented: $confirmNFCWrite, titleVisibility: .visible) {
                                Button("Replace tag content", role: .destructive) { nfc.write(NativeShared.link(agentID: agent)) }
                            }
                            .disabled(!NativeNFC.available || nfc.busy)
                        Button("Read NFC tag") { nfc.read { native.receive($0) } }
                            .disabled(!NativeNFC.available || nfc.busy)
                        Text("This link opens the same agent for existing participants. It does not invite people or grant access. NFC background opening requires Associated Domains configuration.")
                            .font(.footnote).foregroundStyle(.secondary)
                        if let message = nfc.message { Text(message).font(.footnote) }
                    }
                }
                let sessions = Activity<ContactSessionAttributes>.activities.filter { $0.attributes.contactID == contactID && $0.attributes.userID == auth.user?.id }
                if !sessions.isEmpty {
                    Section("Live sessions") {
                        ForEach(sessions, id: \.id) { session in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(session.attributes.title).font(.headline)
                                NativeSessionContent(attributes: session.attributes, state: session.content.state)
                                HStack {
                                    if session.attributes.kind == "recipe" {
                                        Button("Next step") { change(session, "next") }
                                    } else {
                                        Button(session.content.state.endDate == nil ? "Resume" : "Pause") { change(session, "pause") }
                                    }
                                    Button("Finish", role: .destructive) { change(session, "finish") }
                                }.buttonStyle(.bordered)
                            }
                        }
                    }.id(sessionRevision)
                }
                let alarms = native.localAlarms.filter { $0.contactID == contactID }
                if !alarms.isEmpty {
                    Section("Scheduled system alarms") {
                        ForEach(alarms) { alarm in
                            LabeledContent(alarm.title) {
                                Button("Cancel alarm", role: .destructive) { native.cancelLocalAlarm(alarm) }
                                    .disabled(!native.busy.isEmpty)
                            }
                        }
                    }
                }
                Section {
                    if native.actions[contactID] == nil { ProgressView("Loading requests…") }
                    else if native.actions[contactID]?.isEmpty == true { Text("No native requests yet.").foregroundStyle(.secondary) }
                    ForEach(native.actions[contactID] ?? []) { action in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(action.payload?.title ?? "Native action").font(.headline)
                            Text(NativeExperiments.labels[action.kind] ?? action.kind).font(.caption).foregroundStyle(.secondary)
                            if let payload = action.payload {
                                if let body = payload.body { Text(body).font(.subheadline) }
                                if let seconds = payload.durationSeconds { Text("Duration: \(seconds) seconds").font(.subheadline) }
                                if let date = payload.date { Text("Starts: \(date)").font(.subheadline).textSelection(.enabled) }
                                if let date = payload.endDate { Text("Ends: \(date)").font(.subheadline).textSelection(.enabled) }
                                if let steps = payload.steps {
                                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in Text("\(index + 1). \(step)").font(.subheadline) }
                                }
                                if payload.kind == "location_reminder" {
                                    Text("\(payload.trigger == "departure" ? "On departure" : "On arrival") · radius \(Int(payload.radius ?? 200)) m").font(.subheadline)
                                    if let lat = payload.latitude, let lon = payload.longitude { Text("\(lat), \(lon)").font(.caption) }
                                    else { Text("Choose the location on a map when you run this action.").font(.caption) }
                                }
                            }
                            Text(statusLabel(action)).font(.caption).foregroundStyle(.secondary)
                            if action.status == "pending", action.expiresAt > Date.now.timeIntervalSince1970 * 1000 {
                                HStack {
                                    Button("Review and run") { Task { await native.run(action, contactID: contactID, using: auth) } }
                                        .disabled(!kinds.contains(action.kind) || !native.busy.isEmpty)
                                    Button("Dismiss", role: .destructive) { Task { await native.dismiss(action, contactID: contactID, using: auth) } }
                                        .disabled(native.busy.contains(action.id))
                                }.buttonStyle(.bordered)
                            } else if action.status == "running", !native.busy.contains(action.id) {
                                Text("An interrupted action may already exist in iOS. Check before requesting another.").font(.caption)
                                Button("Mark outcome unknown") { Task { await native.abandon(action, contactID: contactID, using: auth) } }
                            }
                        }.padding(.vertical, 4)
                    }
                } header: { Text("Requests on this iPhone") } footer: {
                    Text("Completed means this device finished the requested operation, such as scheduling an alarm. It does not mean the alarm rang or a real-world task was completed. Requests expire after 24 hours. Calendar and reminder items you save remain in their system apps.")
                }
            }
            if native.speaking { Button("Stop reading") { native.stopSpeaking() } }
            if let error = native.error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle("Native experiments")
        .refreshable { await native.refresh(contactID: contactID, using: auth, force: true) }
        .task(id: "\(scenePhase)-\(kinds.sorted())") {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await native.refresh(contactID: contactID, using: auth)
                native.refreshLocalAlarms()
                sessionRevision += 1
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
    private func change(_ activity: Activity<ContactSessionAttributes>, _ action: String) {
        Task { _ = try? await ChangeContactSessionIntent(activityID: activity.id, action: action).perform(); sessionRevision += 1 }
    }
    private func statusLabel(_ action: NativeAction) -> String {
        switch action.status {
        case "pending": action.expiresAt <= Date.now.timeIntervalSince1970 * 1000 ? "Expired" : "Waiting for you to run on this device"
        case "running": "Execution started · outcome not confirmed"
        case "completed": "Completed on this device"
        case "cancelled": "Cancelled"
        case "unknown": "Outcome unknown · inspect the system app"
        case "expired": "Expired"
        default: "Failed"
        }
    }
}
struct NativeSessionContent: View {
    let attributes: ContactSessionAttributes
    let state: ContactSessionAttributes.ContentState
    var body: some View {
        if attributes.kind == "recipe", attributes.steps.indices.contains(state.step) {
            Text("Step \(state.step + 1) of \(attributes.steps.count): \(attributes.steps[state.step])")
        } else if let end = state.endDate, end > .now {
            Text(timerInterval: Date.now...end, countsDown: true).monospacedDigit()
        } else if state.pausedRemaining != nil { Text("Paused") }
        else { Text("Session complete") }
    }
}
struct NativeCalendarEditor: UIViewControllerRepresentable {
    let request: NativeExperiments.CalendarRequest
    let finish: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(finish) }
    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let controller = EKEventEditViewController()
        controller.eventStore = request.store
        controller.event = request.event
        controller.editViewDelegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}
    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let finish: (String) -> Void
        init(_ finish: @escaping (String) -> Void) { self.finish = finish }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { finish(action == .saved ? "completed" : "cancelled") }
    }
}
struct NativeLocationPicker: View {
    let finish: (Double, Double) -> Void
    @State private var query = ""
    @State private var position: MapCameraPosition = .automatic
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var error: String?
    @State private var searching = false
    var body: some View {
        NavigationStack {
            VStack {
                TextField("Search for a place", text: $query).textFieldStyle(.roundedBorder).padding(.horizontal)
                    .onSubmit { Task { await search() } }
                MapReader { reader in
                    Map(position: $position) {
                        if let coordinate { Marker("Reminder location", coordinate: coordinate) }
                    }
                    .onTapGesture { point in coordinate = reader.convert(point, from: .local) }
                }
                Text("Tap the map or search to choose the reminder location.").font(.footnote).padding(.horizontal)
                if searching { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Reminder location")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { finish(.nan, .nan) } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Use location") { if let coordinate { finish(coordinate.latitude, coordinate.longitude) } }.disabled(coordinate == nil)
                }
            }
        }
    }
    private func search() async {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty, !searching else { return }
        searching = true; error = nil
        defer { searching = false }
        do {
            let request = MKLocalSearch.Request(); request.naturalLanguageQuery = query
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first else { error = "No place found. Tap the map to choose."; return }
            coordinate = item.location.coordinate
            position = .region(MKCoordinateRegion(center: item.location.coordinate, span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)))
        } catch { self.error = error.localizedDescription }
    }
}
