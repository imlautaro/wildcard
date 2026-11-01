import SwiftUI
import EventKitUI
import MapKit
import ActivityKit
import AlarmKit

struct NativeToolsView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native
    @Environment(\.scenePhase) private var scenePhase
    // Deprecated NFC UI state retained with its implementation.
    #if false
    @State private var nfc = NativeNFC()
    @State private var confirmNFCWrite = false
    #endif
    @State private var sessionRevision = 0
    @State private var sheet: SheetKind?

    private enum SheetKind: String, Identifiable {
        case tools, automatic, examples
        var id: String { rawValue }
        var title: String {
            switch self {
            case .tools: "Allowed tools"
            case .automatic: "Run without confirmation"
            case .examples: "Try it in chat"
            }
        }
        var info: String {
            switch self {
            case .tools: "Tools this contact can use on this iPhone. Each request still appears in Requests on this iPhone."
            case .automatic: "Applies to new requests on this iPhone while Wildcard is open. iOS may ask for permission the first time. Calendar and location reminders still require review. Older requests remain manual."
            case .examples: "Run an Open contact or Draft message shortcut from Siri, Spotlight or the Action button. Add the Contact widget to your Home Screen. Shared inputs remain drafts until you send them."
            }
        }
    }
    private var kinds: Set<String> { native.enabled[contactID] ?? [] }
    private var contact: Contact? { contacts.contact(id: contactID) }
    private static let examples: [(kind: String, text: String)] = [
        // Deprecated examples retained for reference:
        // ("focus", "“Help me focus for 25 minutes”"), ("recipe", "“Guide me through a recipe”"),
        // ("speech", "“Read this aloud”"),
        ("timer", "“Set a timer for 12 minutes”"), ("calendar", "“Add an event tomorrow at 3 PM”"),
    ]
    var body: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    ContactAvatar(contact: contact, size: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(contact?.name ?? "Contact").manrope(.headline, weight: .bold)
                        Text(kinds.isEmpty ? "Off on this iPhone" : "\(kinds.count) of \(NativeExperiments.kinds.count) tools enabled on this iPhone")
                            .manrope(.footnote).foregroundStyle(.secondary)
                    }
                }.padding(.vertical, 4)
                HStack {
                    Toggle("Enable native experiments", isOn: Binding(get: { !kinds.isEmpty }, set: {
                        native.setKinds($0 ? Set(NativeExperiments.kinds) : [], contactID: contactID)
                    }))
                    InfoButton(title: "Native experiments", text: "Enables this contact's name in Shortcuts, Siri, widgets and the share sheet on this device. Timers and alarms run automatically when requested in this private chat while Wildcard is open. Choose other automatic tools below. Lock Screen activities may show their titles. Other participants receive no device access unless you explicitly allow them under Shared-contact access to this iPhone.")
                }
            }
            Section("Remote timers and alarms") {
                RemoteNativeControls(contactID: contactID, chat: contacts.conversations.store(for: contactID), showEmpty: true)
            }
            if !kinds.isEmpty {
                Section {
                    HStack {
                        Toggle(isOn: Binding(
                            get: { native.remoteEnabled.contains(contactID) },
                            set: { on in Task { await native.setRemoteEnabled(on, contactID: contactID, using: auth) } }
                        )) {
                            NativeToolLabel(kind: "timer", title: "Allow remote timers and alarms", symbol: "iphone.radiowaves.left.and.right")
                        }.disabled(native.remoteBusy)
                        InfoButton(title: "Remote timers and alarms", text: "Lets requests from your other signed-in devices schedule timers and alarms on this iPhone, including while locked or Wildcard is closed. Requires AlarmKit and visible notifications. Delivery may be delayed; requests expire after one minute. This does not enable autonomous initiative actions.")
                    }
                } footer: {
                    // What the switch grants stays visible next to it.
                    Text("Your other devices can schedule timers and alarms on this iPhone. Select this iPhone above to allow individual shared-contact participants.")
                }
                Section {
                    let automatic = NativeExperiments.kinds.filter { kinds.contains($0) && NativeExperiments.automaticKinds.contains($0) }
                    SheetRow(title: "Allowed tools", systemImage: "wrench.and.screwdriver",
                             value: "\(kinds.count) of \(NativeExperiments.kinds.count)") { sheet = .tools }
                    SheetRow(title: "Run without confirmation", systemImage: "bolt",
                             value: "\(automatic.filter { native.automaticSince[contactID]?[$0] != nil }.count) of \(automatic.count)") { sheet = .automatic }
                    SheetRow(title: "Try it in chat", systemImage: "text.bubble", value: "\(Self.examples.count) ideas") { sheet = .examples }
                }
                if let agent = contact?.agentID {
                    Section {
                        ShareLink(item: NativeShared.link(agentID: agent)) { Label("Share contact link", systemImage: "square.and.arrow.up") }
                        // Deprecated NFC controls retained, excluded from the app.
                        #if false
                        Button { confirmNFCWrite = true } label: { Label("Write contact link to NFC tag", systemImage: "sensor.tag.radiowaves.forward") }
                            .confirmationDialog("Replace the NFC tag’s content with this contact link?", isPresented: $confirmNFCWrite, titleVisibility: .visible) {
                                Button("Replace tag content", role: .destructive) { nfc.write(NativeShared.link(agentID: agent)) }
                            }
                            .disabled(!NativeNFC.available || nfc.busy)
                        Button { nfc.read { native.receive($0) } } label: { Label("Read NFC tag", systemImage: "wave.3.right") }
                            .disabled(!NativeNFC.available || nfc.busy)
                        if let message = nfc.message { Text(message).manrope(.footnote) }
                        #endif
                    } header: {
                        HStack {
                            Text("Contact link")
                            InfoButton(title: "Contact link", text: "This link opens the same agent for existing participants. It does not invite people or grant access.")
                        }
                    }
                }
                // Deprecated focus/recipe controls retained for reference.
                #if false
                let sessions = Activity<ContactSessionAttributes>.activities.filter { $0.attributes.contactID == contactID && $0.attributes.userID == auth.user?.id }
                if !sessions.isEmpty {
                    Section("Live sessions") {
                        ForEach(sessions, id: \.id) { session in
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(alignment: .top, spacing: 12) {
                                    NativeGlyph(kind: session.attributes.kind, size: 32)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(session.attributes.title).manrope(.headline, weight: .semibold)
                                        NativeSessionContent(attributes: session.attributes, state: session.content.state)
                                    }
                                }
                                HStack {
                                    if session.attributes.kind == "recipe" {
                                        Button { change(session, "next") } label: { Label("Next step", systemImage: "forward.fill") }
                                            .buttonStyle(.borderedProminent)
                                    } else {
                                        let paused = session.content.state.endDate == nil
                                        Button { change(session, "pause") } label: { Label(paused ? "Resume" : "Pause", systemImage: paused ? "play.fill" : "pause.fill") }
                                            .buttonStyle(.borderedProminent)
                                    }
                                    Button("Finish", role: .destructive) { change(session, "finish") }.buttonStyle(.bordered)
                                }.buttonBorderShape(.capsule).manrope(.subheadline, weight: .semibold)
                            }.padding(.vertical, 4)
                        }
                    }.id(sessionRevision)
                }
                #endif
                let alarms = native.localAlarms.filter { $0.contactID == contactID }
                if !alarms.isEmpty {
                    Section("Scheduled system alarms") {
                        ForEach(alarms) { alarm in
                            NativeAlarmRow(alarm: alarm)
                        }
                    }
                }
                Section {
                    if native.actions[contactID] == nil { ProgressView("Loading requests…") }
                    else if native.actions[contactID]?.isEmpty == true {
                        Label("No native requests yet.", systemImage: "tray").foregroundStyle(.secondary)
                    }
                    ForEach(native.actions[contactID] ?? []) { action in
                        requestRow(action)
                    }
                } header: {
                    HStack {
                        Text("Requests on this iPhone")
                        InfoButton(title: "Requests", text: "Completed means this device finished the requested operation, such as scheduling an alarm. It does not mean the alarm rang or a real-world task was completed. Requests expire after 24 hours. Calendar and reminder items you save remain in their system apps.")
                    }
                }
            }
            #if false // Deprecated spoken-response control.
            if native.speaking {
                Button { native.stopSpeaking() } label: { Label("Stop reading", systemImage: "stop.fill") }
            }
            #endif
            if let error = native.error {
                Section { Label { Text(error) } icon: { Image(systemName: "exclamationmark.triangle.fill") }.foregroundStyle(.red) }
            }
        }
        .onChange(of: native.remoteEnabled) { _, _ in
            Task { try? await contacts.refreshRemote(contactID: contactID, using: auth, force: true) }
        }
        .navigationTitle("Native experiments")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { kind in
            NavigationStack {
                Form {
                    switch kind {
                    case .tools:
                        ForEach(NativeExperiments.kinds, id: \.self) { kind in
                            Toggle(isOn: Binding(get: { kinds.contains(kind) }, set: { on in
                                var value = kinds
                                if on { value.insert(kind) } else { value.remove(kind) }
                                native.setKinds(value, contactID: contactID)
                            })) { NativeToolLabel(kind: kind) }
                        }
                    case .automatic:
                        let automatic = NativeExperiments.kinds.filter { kinds.contains($0) && NativeExperiments.automaticKinds.contains($0) }
                        if automatic.isEmpty { Text("Allow a tool first.").foregroundStyle(.secondary) }
                        ForEach(automatic, id: \.self) { kind in
                            Toggle(isOn: Binding(
                                get: { native.automaticSince[contactID]?[kind] != nil },
                                set: { native.setAutomatic($0, kind: kind, contactID: contactID) }
                            )) { NativeToolLabel(kind: kind) }
                        }
                    case .examples:
                        ForEach(Self.examples, id: \.text) { example in
                            Label { Text(example.text).manrope(.subheadline) } icon: { NativeGlyph(kind: example.kind, size: 26) }
                        }
                    }
                }
                .navigationTitle(kind.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { InfoButton(title: kind.title, text: kind.info) }
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { sheet = nil } }
                }
            }
            .presentationDetents([.medium, .large])
        }
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
    private func requestRow(_ action: NativeAction) -> some View {
        let tone = NativeActionTone(action, busy: native.busy.contains(action.id))
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                NativeGlyph(kind: action.kind, size: 32)
                VStack(alignment: .leading, spacing: 4) {
                    Text(action.payload?.title ?? "Native action").manrope(.headline, weight: .semibold)
                    Text(NativeExperiments.labels[action.kind] ?? action.kind).manrope(.caption).foregroundStyle(.secondary)
                    if let payload = action.payload { NativePayloadDetails(payload: payload) }
                    Label { Text(statusLabel(action)).manrope(.caption, weight: .semibold) } icon: { Image(systemName: tone.symbol) }
                        .labelStyle(NativeCompactLabelStyle())
                        .foregroundStyle(tone.color)
                        .padding(.top, 2)
                }
            }
            if NativeExperiments.kinds.contains(action.kind), action.remoteDeviceID == nil, action.status == "pending", action.expiresAt > Date.now.timeIntervalSince1970 * 1000 {
                HStack {
                    Button("Review and run") { Task { await native.run(action, contactID: contactID, using: auth) } }
                        .buttonStyle(.borderedProminent)
                        .disabled(!kinds.contains(action.kind) || !native.busy.isEmpty)
                    Button("Dismiss", role: .destructive) { Task { await native.dismiss(action, contactID: contactID, using: auth) } }
                        .buttonStyle(.bordered)
                        .disabled(native.busy.contains(action.id))
                }.buttonBorderShape(.capsule).manrope(.subheadline, weight: .semibold).padding(.leading, 44)
            } else if action.remoteDeviceID == nil, action.status == "running", !native.busy.contains(action.id) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("An interrupted action may already exist in iOS. Check before requesting another.").manrope(.caption).foregroundStyle(.secondary)
                    Button("Mark outcome unknown") { Task { await native.abandon(action, contactID: contactID, using: auth) } }
                        .buttonStyle(.bordered).buttonBorderShape(.capsule).manrope(.subheadline, weight: .semibold)
                }.padding(.leading, 44)
            }
        }.padding(.vertical, 4)
    }
    private func change(_ activity: Activity<ContactSessionAttributes>, _ action: String) {
        Task { _ = try? await ChangeContactSessionIntent(activityID: activity.id, action: action).perform(); sessionRevision += 1 }
    }
    private func statusLabel(_ action: NativeAction) -> String {
        switch action.status {
        case "pending": action.expiresAt <= Date.now.timeIntervalSince1970 * 1000 ? "Expired" : action.remoteDeviceID != nil ? "Sent to this iPhone · awaiting background execution" : "Waiting for you to run on this device"
        case "running": "Execution started · outcome not confirmed"
        case "completed": "Completed on this device"
        case "cancelled": "Cancelled"
        case "unknown": "Outcome unknown · inspect the system app"
        case "expired": "Expired"
        default: "Failed"
        }
    }
}
/// Human-readable request details; raw values remain selectable where they are not reformatted.
private struct NativePayloadDetails: View {
    let payload: NativePayload
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let body = payload.body { Text(body).manrope(.subheadline) }
            if let seconds = payload.durationSeconds {
                detail("hourglass", Duration.seconds(seconds).formatted(.units(allowed: [.hours, .minutes, .seconds], width: .wide)))
            }
            if let date = payload.date { detail("calendar", "Starts \(Self.format(date))") }
            if let date = payload.endDate { detail("calendar.badge.checkmark", "Ends \(Self.format(date))") }
            if let steps = payload.steps {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(index + 1)").manrope(.caption, weight: .bold).foregroundStyle(.secondary).frame(minWidth: 14, alignment: .trailing)
                            Text(step).manrope(.subheadline)
                        }
                    }
                }.padding(.top, 2)
            }
            if payload.kind == "location_reminder" {
                detail(payload.trigger == "departure" ? "figure.walk.departure" : "figure.walk.arrival",
                       "\(payload.trigger == "departure" ? "On departure" : "On arrival") · radius \(Int(payload.radius ?? 200)) m")
                if let lat = payload.latitude, let lon = payload.longitude {
                    Text("\(lat), \(lon)").manrope(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                } else {
                    Text("Choose the location on a map when you run this action.").manrope(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
    private func detail(_ symbol: String, _ text: String) -> some View {
        Label { Text(text).manrope(.subheadline).textSelection(.enabled) } icon: { Image(systemName: symbol).foregroundStyle(.secondary) }
            .labelStyle(NativeCompactLabelStyle())
    }
    private static func format(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        var date = parser.date(from: value)
        if date == nil { parser.formatOptions.insert(.withFractionalSeconds); date = parser.date(from: value) }
        return date?.formatted(date: .abbreviated, time: .shortened) ?? value
    }
}
/// Settings-style row label: colored glyph and tool name.
struct NativeToolLabel: View {
    let kind: String
    var title: String? = nil
    var symbol: String? = nil
    var body: some View {
        Label { Text(title ?? NativeExperiments.labels[kind] ?? kind) } icon: { NativeGlyph(kind: kind, size: 28, symbol: symbol) }
    }
}
struct NativeAlarmRow: View {
    let alarm: NativeLocalAlarm
    @Environment(NativeExperiments.self) private var native
    var body: some View {
        let system = native.systemAlarms[alarm.id]
        HStack(spacing: 12) {
            NativeGlyph(kind: system?.countdownDuration == nil ? "alarm" : "timer", size: 28)
            Text(alarm.title).lineLimit(2)
            Spacer(minLength: 8)
            Button("Cancel alarm", role: .destructive) { native.cancelLocalAlarm(alarm) }
                .buttonStyle(.bordered).buttonBorderShape(.capsule).manrope(.footnote, weight: .semibold)
                .disabled(!native.busy.isEmpty)
        }
    }
}
struct NativeSessionContent: View {
    let attributes: ContactSessionAttributes
    let state: ContactSessionAttributes.ContentState
    var compact = false
    var body: some View {
        if attributes.kind == "recipe", attributes.steps.indices.contains(state.step) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Step \(state.step + 1) of \(attributes.steps.count)").manrope(.caption, weight: .semibold).foregroundStyle(NativeStyle.tint(for: "recipe"))
                Text(attributes.steps[state.step]).manrope(compact ? .footnote : .subheadline).foregroundStyle(compact ? .secondary : .primary)
            }
        } else if let end = state.endDate, end > .now {
            Text(timerInterval: Date.now...end, countsDown: true)
                .font(.system(compact ? .title3 : .title2, design: .rounded, weight: .semibold)).monospacedDigit()
                .foregroundStyle(NativeStyle.tint(for: attributes.kind))
        } else if let remaining = state.pausedRemaining {
            Text("Paused · \(NativeStyle.remaining(remaining)) left").manrope(compact ? .footnote : .subheadline, weight: .semibold).foregroundStyle(.secondary)
        }
        else { Text("Session complete").manrope(compact ? .footnote : .subheadline).foregroundStyle(.secondary) }
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
