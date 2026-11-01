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
        catch { self.error = "Remote actions are unavailable. Check App Group signing for the notification extension." }
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
            guard !(enabled[contactID] ?? []).intersection(["timer", "alarm"]).isEmpty else { throw AuthAPI.Failure.rejected("Enable timers or alarms for this contact first.") }
            let alarmAuthorization = requestPermission ? try await AlarmManager.shared.requestAuthorization() : AlarmManager.shared.authorizationState
            guard alarmAuthorization == .authorized else { throw AuthAPI.Failure.rejected("Allow AlarmKit in Settings first.") }
            if requestPermission { await PushNotifications.shared.activate(using: auth, requestPermission: true) }
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            guard settings.alertSetting == .enabled, let pushToken = PushNotifications.shared.deviceToken,
                  let environment = Bundle.main.object(forInfoDictionaryKey: "WildcardPushEnvironment") as? String else {
                // At launch APNs delivers the token after this refresh starts; Home reruns it when the token arrives.
                guard requestPermission else { return }
                throw AuthAPI.Failure.rejected("Enable visible notifications, then try again once this iPhone is registered.")
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
        func base(_ device: RemoteNativeDevice) -> String { device.owned == 1 ? "Your \(device.name)" : device.name }
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
    private var contactName: String { contacts.contact(id: contactID)?.name ?? "this contact" }
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
        case .needsTools: "Allow Timers or Alarms in Allowed tools first."
        case .off: "Off. Only this chat on this iPhone can set them."
        case .needsNotifications: "Paused. Notifications for Wildcard are off."
        case .needsAlarms: "Paused. Wildcard isn’t allowed to set alarms."
        case .registering: "Connecting this iPhone…"
        case .on: "On. Works in the background and while locked."
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
            Text("From the web and other people")
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

/// Requester side: a compact chip above the composer that shows where timers and alarms
/// requested in this chat go. Selection is always explicit and never falls back silently.
struct RemoteNativeTargetChip: View {
    let contactID: String
    let chat: ChatStore
    let error: String?
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native

    private var snapshot: RemoteNativeSnapshot? { contacts.remoteSnapshots.store(for: contactID).value }
    private var thisDevice: String? { try? native.deviceID() }
    // This iPhone already handles its own requests locally, so it is never a remote choice here.
    private var targets: [RemoteNativeDevice] { (snapshot?.devices ?? []).filter { $0.id != thisDevice } }
    private var selected: RemoteNativeDevice? { snapshot?.devices.first { $0.id == chat.remoteDeviceID } }
    private var unavailable: Bool { chat.remoteDeviceID != nil && selected == nil }
    private var localOn: Bool { !(native.enabled[contactID] ?? []).isDisjoint(with: ["timer", "alarm"]) }
    private var selectedLabel: String? {
        guard let selected, let snapshot else { return nil }
        return selected.id == thisDevice ? "This iPhone" : snapshot.label(for: selected)
    }
    private var title: String {
        if unavailable { return "Selected iPhone unavailable" }
        if let selectedLabel { return "Timers & alarms: \(selectedLabel)" }
        return localOn ? "Timers & alarms: This iPhone" : "Timers & alarms: Off"
    }
    private var tint: Color { unavailable ? .red : selected != nil ? .accentColor : .secondary }

    var body: some View {
        if !targets.isEmpty || chat.remoteDeviceID != nil || error != nil {
            VStack(alignment: .leading, spacing: 4) {
                Menu {
                    Picker("Send timers and alarms to", selection: Binding(get: { chat.remoteDeviceID ?? "" }, set: { chat.remoteDeviceID = $0.isEmpty ? nil : $0 })) {
                            Label(localOn ? "This iPhone" : "Don’t send to a phone", systemImage: localOn ? "iphone" : "nosign").tag("")
                            if unavailable, let id = chat.remoteDeviceID {
                                Label("Unavailable iPhone", systemImage: "exclamationmark.triangle").tag(id)
                            }
                            ForEach(targets) { device in
                                Label(snapshot?.label(for: device) ?? device.name, systemImage: "iphone.radiowaves.left.and.right").tag(device.id)
                            }
                        }
                        .pickerStyle(.inline)
                        .disabled(chat.isSending || chat.hasPendingRemoteSubmission)
                    Section {
                        Text("Another phone gets the request as a notification, even while locked. This chat shows when it’s set.")
                    }
                    if chat.hasPendingRemoteSubmission && !chat.isSending {
                        Button("Discard pending send", systemImage: "xmark.circle", role: .destructive) { chat.discardPendingRemoteSubmission() }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: unavailable ? "exclamationmark.triangle.fill" : selected != nil ? "iphone.radiowaves.left.and.right" : "timer")
                        Text(title).lineLimit(1)
                        Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold))
                    }
                    .manrope(.footnote, weight: .semibold)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(tint.opacity(selected != nil || unavailable ? 0.14 : 0.08), in: Capsule())
                    .contentShape(Capsule())
                }
                .accessibilityLabel("Where timers and alarms go")
                .accessibilityValue(title)
                if unavailable {
                    Text("That phone’s access was turned off or it signed out. Choose where to send timers before asking again.")
                        .manrope(.caption).foregroundStyle(.red)
                } else if chat.hasPendingRemoteSubmission && !chat.isSending {
                    Text("A message is waiting to resend to \(selectedLabel ?? "that phone"). Check that phone before discarding it from this menu.")
                        .manrope(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).manrope(.caption).foregroundStyle(.red) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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
        case "completed": "Set on \(device)"
        case "pending": "Sending to \(device)…"
        case "running": "Reached \(device) · not confirmed yet"
        case "expired": "\(device) didn’t respond in time"
        case "failed": "\(device) couldn’t set it"
        case "cancelled": "Cancelled on \(device)"
        default: "Not confirmed · check \(device)"
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
