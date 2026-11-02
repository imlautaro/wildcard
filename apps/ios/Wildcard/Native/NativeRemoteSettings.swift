import Foundation
import AlarmKit
import UserNotifications
import UIKit
import SwiftUI

@MainActor extension NativeExperiments {
    func publishRemoteSettings() {
        guard let userID, let id = try? deviceID() else { return }
        let contacts = Dictionary(uniqueKeysWithValues: remoteEnabled.compactMap { contactID -> (String, [String])? in
            let kinds = (enabled[contactID] ?? []).intersection(["timer", "alarm"]).sorted()
            return kinds.isEmpty ? nil : (contactID, kinds)
        })
        let config = RemoteNativeConfiguration(userID: userID, deviceID: id, contacts: contacts)
        guard config != RemoteNativeShared.configuration else { return }
        do { try RemoteNativeShared.writeConfiguration(config) }
        catch { self.error = String(localized: "Remote actions are unavailable. Check App Group signing for the notification extension.") }
    }
    func setRemoteEnabled(_ on: Bool, contactID: String, using auth: AuthStore, requestPermission: Bool = true) async {
        guard let owner = userID, owner == auth.user?.id, !remoteBusy else { return }
        remoteBusy = true
        defer { remoteBusy = false }
        do {
            let id = try deviceID()
            if !on || (!requestPermission && (enabled[contactID] ?? []).intersection(["timer", "alarm"]).isEmpty) {
                remoteEnabled.remove(contactID)
                UserDefaults.standard.set(Array(remoteEnabled).sorted(), forKey: "native-remote.\(owner)")
                publishRemoteSettings()
                _ = try await auth.withSession { api, token in
                    try await api.send(path: "contacts/\(contactID)/native-remote/\(id)", method: "DELETE", token: token)
                }
                return
            }
            guard !(enabled[contactID] ?? []).intersection(["timer", "alarm"]).isEmpty else { throw AuthAPI.Failure.rejected(String(localized: "Enable timers or alarms for this contact first.")) }
            let alarmAuthorization = requestPermission ? try await AlarmManager.shared.requestAuthorization() : AlarmManager.shared.authorizationState
            guard alarmAuthorization == .authorized else { throw AuthAPI.Failure.rejected(String(localized: "Allow AlarmKit in Settings first.")) }
            if requestPermission { await PushNotifications.shared.activate(using: auth, requestPermission: true) }
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            guard settings.alertSetting == .enabled, let pushToken = PushNotifications.shared.deviceToken,
                  let environment = Bundle.main.object(forInfoDictionaryKey: "WildcardPushEnvironment") as? String else {
                // At launch APNs delivers the token after this refresh starts; Home reruns it when the token arrives.
                guard requestPermission else { return }
                throw AuthAPI.Failure.rejected(String(localized: "Enable visible notifications, then try again once this iPhone is registered."))
            }
            guard auth.user?.id == owner, userID == owner else { return }
            struct Registration: Encodable { let token: String; let environment: String; let name: String; let grant: String; let kinds: [String] }
            let body = try JSONEncoder().encode(Registration(token: pushToken, environment: environment, name: "iPhone", grant: requestPermission ? "enable" : "refresh",
                kinds: (enabled[contactID] ?? []).intersection(["timer", "alarm"]).sorted()))
            _ = try await auth.withSession { api, token in
                try await api.send(path: "contacts/\(contactID)/native-remote/\(id)", method: "PUT", body: body, token: token)
            }
            guard userID == owner, auth.user?.id == owner else { return }
            var updated = remoteEnabled; updated.insert(contactID)
            let contacts = Dictionary(uniqueKeysWithValues: updated.map { ($0, Array((enabled[$0] ?? []).intersection(["timer", "alarm"])).sorted()) })
            try RemoteNativeShared.writeConfiguration(RemoteNativeConfiguration(userID: owner, deviceID: id, contacts: contacts))
            remoteEnabled = updated
            UserDefaults.standard.set(Array(updated).sorted(), forKey: "native-remote.\(owner)")
            error = nil
        } catch {
            if !requestPermission, case AuthAPI.Failure.rejected(let message) = error,
               message == "Remote permission was revoked. Enable it again on this iPhone." {
                remoteEnabled.remove(contactID)
                UserDefaults.standard.set(Array(remoteEnabled).sorted(), forKey: "native-remote.\(owner)")
                publishRemoteSettings()
            }
            // Background re-registration retries on the next launch or token change.
            if !requestPermission && AuthAPI.isTransient(error) { return }
            self.error = error.localizedDescription
        }
    }
    func syncRemoteRegistration(using auth: AuthStore) async {
        // Existing grants are re-registered when APNs rotates or the app restores its session.
        for contactID in remoteEnabled.sorted() {
            guard !Task.isCancelled, userID == auth.user?.id else { return }
            await setRemoteEnabled(true, contactID: contactID, using: auth, requestPermission: false)
        }
    }
}

extension RemoteNativeSnapshot {
    /// "Your iPhone" for this account's phones, "Ana’s iPhone" for a phone shared with you.
    /// The installation suffix appears only when two phones would otherwise read the same.
    func label(for device: RemoteNativeDevice) -> String {
        func base(_ device: RemoteNativeDevice) -> String { device.owned == 1 ? String(localized: "Your \(device.name)") : device.name }
        let name = base(device)
        return devices.filter { base($0) == name }.count > 1 ? "\(name) · \(device.id.suffix(4))" : name
    }
}

// Chat receipts, the chat destination chip and the owner settings all read the same
// session-owned snapshot; this keeps it fresh while the scene is active.
struct RemoteNativePolling: ViewModifier {
    let contactID: String
    @Binding var error: String?
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    func body(content: Content) -> some View {
        content.task(id: "\(contactID)-\(scenePhase == .active)") {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                do {
                    try await contacts.refreshRemote(contactID: contactID, using: auth)
                    error = nil
                } catch {
                    if error is CancellationError || Task.isCancelled { return }
                    if contacts.remoteSnapshots.store(for: contactID).value == nil || !AuthAPI.isTransient(error) {
                        self.error = error.localizedDescription
                    }
                }
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
}

/// Owner side: whether this iPhone accepts timers and alarms that come from somewhere
/// other than this chat on this iPhone, and who may send them.
struct RemoteNativeAccessSection: View {
    let contactID: String
    var loadError: String? = nil
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var notificationsAllowed: Bool?
    @State private var alarmsAllowed: Bool?
    @State private var error: String?

    private enum Status { case needsTools, off, needsNotifications, needsAlarms, registering, on }
    private var snapshot: RemoteNativeSnapshot? { contacts.remoteSnapshots.store(for: contactID).value }
    private var thisDevice: String? { try? native.deviceID() }
    private var hasKinds: Bool { !(native.enabled[contactID] ?? []).isDisjoint(with: ["timer", "alarm"]) }
    private var isOn: Bool { native.remoteEnabled.contains(contactID) }
    private var registered: Bool { snapshot?.devices.contains { $0.id == thisDevice && $0.owned == 1 } ?? false }
    private var contactName: String { contacts.contact(id: contactID)?.name ?? String(localized: "this contact") }
    private var status: Status {
        if !hasKinds { return .needsTools }
        if !isOn { return .off }
        if notificationsAllowed == false { return .needsNotifications }
        if alarmsAllowed == false { return .needsAlarms }
        if snapshot != nil && !registered { return .registering }
        return .on
    }
    private var statusText: String {
        switch status {
        case .needsTools: String(localized: "Turn on Timers or Alarms in this contact’s Native experiments first.")
        case .off: String(localized: "Off. Only this chat on this iPhone can set them.")
        case .needsNotifications: String(localized: "Paused. Notifications for Wildcard are off.")
        case .needsAlarms: String(localized: "Paused. Wildcard isn’t allowed to set alarms.")
        case .registering: String(localized: "Connecting this iPhone…")
        case .on: String(localized: "On. Works in the background and while locked.")
        }
    }
    private var statusColor: Color {
        switch status {
        case .on: .green
        case .needsNotifications, .needsAlarms: .orange
        case .registering: .yellow
        case .needsTools, .off: Color(uiColor: .tertiaryLabel)
        }
    }

    var body: some View {
        Section {
            Toggle(isOn: Binding(get: { isOn }, set: { on in
                Task {
                    await native.setRemoteEnabled(on, contactID: contactID, using: auth)
                    await checkPermissions()
                }
            })) {
                Label {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Receive timers and alarms")
                        HStack(spacing: 6) {
                            Circle().fill(statusColor).frame(width: 7, height: 7)
                            Text(statusText)
                        }
                        .manrope(.footnote).foregroundStyle(.secondary)
                    }
                } icon: { NativeGlyph(kind: "timer", size: 28, symbol: "iphone.radiowaves.left.and.right") }
            }
            .disabled(native.remoteBusy || (!hasKinds && !isOn))
            if status == .needsNotifications || status == .needsAlarms {
                Button {
                    let target = status == .needsNotifications ? UIApplication.openNotificationSettingsURLString : UIApplication.openSettingsURLString
                    if let url = URL(string: target) { openURL(url) }
                } label: { Label("Open Settings", systemImage: "gear") }
            }
        } header: {
            Text("This iPhone")
                .task(id: scenePhase) { if scenePhase == .active { await checkPermissions() } }
        } footer: {
            Text(isOn
                 ? "Each request arrives as a notification and sets the timer or alarm on this iPhone. You don’t need to open Wildcard. Requests that can’t reach this iPhone within a minute are dropped."
                 : "Lets you set timers and alarms on this iPhone from the web, and lets people you choose who also chat with \(contactName) do the same.")
        }
        if isOn {
            Section {
                LabeledContent {
                    Image(systemName: "checkmark").foregroundStyle(.secondary)
                } label: {
                    Text("You")
                    Text("From the web and your other devices")
                }
                ForEach(snapshot?.participants ?? []) { participant in
                    Toggle(isOn: Binding(get: { allowed(participant) }, set: { on in set(participant, on) })) {
                        Text(participant.name)
                        Text("Asks \(contactName) in their own chat")
                    }
                    .disabled(!registered || contacts.remoteMutating.contains(contactID))
                }
                if let message = error ?? loadError { Text(message).manrope(.footnote).foregroundStyle(.red) }
            } header: {
                Text("Who can send to this iPhone")
            } footer: {
                Text(snapshot?.participants.isEmpty == false
                     ? "They can’t see your chats, calendar or anything else on this iPhone. Turning someone off doesn’t remove alarms they already set."
                     : "People who also chat with \(contactName) appear here so you can let them in.")
            }
        }
    }
    private func allowed(_ participant: RemoteNativeParticipant) -> Bool {
        snapshot?.delegations.contains { $0.deviceID == thisDevice && $0.participantID == participant.id } ?? false
    }
    private func set(_ participant: RemoteNativeParticipant, _ on: Bool) {
        guard let thisDevice else { return }
        Task {
            do {
                try await contacts.setRemoteDelegate(contactID: contactID, deviceID: thisDevice, participantID: participant.id, allowed: on, using: auth)
                error = nil
            } catch { self.error = error.localizedDescription }
        }
    }
    private func checkPermissions() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notificationsAllowed = settings.alertSetting == .enabled
        alarmsAllowed = AlarmManager.shared.authorizationState != .denied
    }
}

/// Contact details → Timers and alarms. There is no per-chat destination: people ask in
/// chat ("set a timer on Ana’s phone") and the contact picks one of the phones listed here.
/// This iPhone's own receiving switch and who may send to it follow below.
struct ContactPhonesView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native
    @State private var loadError: String?
    private var snapshot: RemoteNativeSnapshot? { contacts.remoteSnapshots.store(for: contactID).value }
    private var thisDevice: String? { try? native.deviceID() }
    // This iPhone is covered by the switch below; its own requests run locally.
    private var phones: [RemoteNativeDevice] { (snapshot?.devices ?? []).filter { $0.id != thisDevice } }
    private var contactName: String { contacts.contact(id: contactID)?.name ?? String(localized: "this contact") }
    private var example: String {
        if let other = phones.first(where: { $0.owned == 0 }) {
            let owner = other.name.components(separatedBy: "’s ").first ?? other.name
            return String(localized: "“Set a timer on \(owner)’s phone for 10 minutes”")
        }
        return String(localized: "“Set a timer for 10 minutes”")
    }
    var body: some View {
        Form {
            Section {
                if snapshot == nil && loadError == nil { ProgressView() }
                ForEach(phones) { device in
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(snapshot?.label(for: device) ?? device.name)
                            Text(device.owned == 1 ? "Your other phone" : "They allowed you to send timers and alarms")
                                .manrope(.footnote).foregroundStyle(.secondary)
                        }
                    } icon: { Image(systemName: "iphone") }
                }
                if snapshot != nil && phones.isEmpty {
                    Text("No other phones yet. People who also chat with \(contactName) can let you use theirs.")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Phones you can use")
            } footer: {
                Text("Just ask \(contactName) in chat, for example \(example). If you don’t name anyone, it goes to this iPhone. The other phone gets it as a notification, even while locked, and the chat shows when it’s set.")
            }
            RemoteNativeAccessSection(contactID: contactID, loadError: loadError)
            if let error = native.error {
                Section { Label { Text(error) } icon: { Image(systemName: "exclamationmark.triangle.fill") }.foregroundStyle(.red) }
            }
        }
        .modifier(RemoteNativePolling(contactID: contactID, error: $loadError))
        .onChange(of: native.remoteEnabled) { _, _ in
            Task { try? await contacts.refreshRemote(contactID: contactID, using: auth, force: true) }
        }
        .navigationTitle("Timers and alarms")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct SharedRemoteReceiptView: View {
    let action: RemoteNativeReceipt
    private var tone: NativeActionTone {
        switch action.status {
        case "completed": .done
        case "pending": .waiting
        case "running", "unknown": .attention
        case "failed": .failed
        default: .inactive
        }
    }
    private var status: String {
        let device = action.deviceName
        return switch action.status {
        case "completed": String(localized: "Set on \(device)")
        case "pending": String(localized: "Sending to \(device)…")
        case "running": String(localized: "Reached \(device) · not confirmed yet")
        case "expired": String(localized: "\(device) didn’t respond in time")
        case "failed": String(localized: "\(device) couldn’t set it")
        case "cancelled": String(localized: "Cancelled on \(device)")
        default: String(localized: "Not confirmed · check \(device)")
        }
    }
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            NativeGlyph(kind: action.kind, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(action.title).manrope(.subheadline, weight: .semibold)
                    .fixedSize(horizontal: false, vertical: true)
                Label { Text(status).manrope(.caption) } icon: { Image(systemName: tone.symbol).foregroundStyle(tone.color) }
                    .labelStyle(NativeCompactLabelStyle())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: 340, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.separator.opacity(0.6), lineWidth: 0.5))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
