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

// Both chat and Native experiments reuse the session-owned remote snapshot.
struct RemoteNativeControls: View {
    let contactID: String
    let chat: ChatStore
    var showEmpty = false
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var error: String?
    private var snapshot: NavigationSnapshot<RemoteNativeSnapshot> { contacts.remoteSnapshots.store(for: contactID) }
    private var selected: RemoteNativeDevice? { snapshot.value?.devices.first { $0.id == chat.remoteDeviceID } }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if showEmpty || !(snapshot.value?.devices.isEmpty ?? true) || chat.remoteDeviceID != nil || error != nil {
                HStack {
                    Image(systemName: "iphone.radiowaves.left.and.right")
                    Picker("Timers and alarms", selection: Binding(get: { chat.remoteDeviceID ?? "" }, set: { chat.remoteDeviceID = $0.isEmpty ? nil : $0 })) {
                        Text("No remote device").tag("")
                        if let id = chat.remoteDeviceID, selected == nil {
                            Text("Selected iPhone unavailable").tag(id)
                        }
                        ForEach(snapshot.value?.devices ?? []) { device in
                            Text("\(device.name) · \(device.id.suffix(6))").tag(device.id)
                        }
                    }.disabled(chat.isSending || chat.hasPendingRemoteSubmission)
                    Button { Task { await refresh(force: true) } } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Refresh devices")
                }
                if chat.remoteDeviceID != nil {
                    Text("Requests go to the selected iPhone through a visible notification, even while locked. Device confirmation is required before reporting success.")
                        .font(.footnote).foregroundStyle(.secondary)
                } else if showEmpty {
                    Text("Choose an authorized iPhone to schedule timers and alarms from this chat.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if chat.remoteDeviceID != nil && selected == nil {
                    Text("Selected iPhone unavailable or access revoked. Choose a device before sending another timer or alarm request.")
                        .font(.footnote).foregroundStyle(.red)
                }
                if chat.hasPendingRemoteSubmission && !chat.isSending {
                    Text("The pending send keeps its original iPhone. Check that phone before requesting again if its outcome is unknown.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button("Discard pending send", role: .destructive) { chat.discardPendingRemoteSubmission() }
                }
                if let selected, selected.owned == 1, let value = snapshot.value, !value.participants.isEmpty {
                    DisclosureGroup("Shared-contact access to this iPhone") {
                        Text("Allow a participant to set timers and alarms through this contact without asking you each time. Revoke access here at any time. Existing alarms remain scheduled.")
                            .font(.footnote).foregroundStyle(.secondary)
                        ForEach(value.participants) { participant in
                            let allowed = value.delegations.contains { $0.deviceID == selected.id && $0.participantID == participant.id }
                            HStack {
                                Text(participant.name)
                                Spacer()
                                Button(allowed ? "Revoke access" : "Allow timers and alarms", role: allowed ? .destructive : nil) {
                                    Task {
                                        do {
                                            try await contacts.setRemoteDelegate(contactID: contactID, deviceID: selected.id, participantID: participant.id, allowed: !allowed, using: auth)
                                            error = nil
                                        } catch { self.error = error.localizedDescription }
                                    }
                                }.disabled(contacts.remoteMutating.contains(contactID))
                            }
                        }
                    }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
    private func refresh(force: Bool = false) async {
        do {
            try await contacts.refreshRemote(contactID: contactID, using: auth, force: force)
            error = nil
        } catch {
            if error is CancellationError || Task.isCancelled { return }
            if snapshot.value != nil && AuthAPI.isTransient(error) { return }
            self.error = error.localizedDescription
        }
    }
}

struct SharedRemoteReceiptView: View {
    let action: RemoteNativeReceipt
    private var status: String {
        switch action.status {
        case "completed": "Scheduled on iPhone"
        case "pending": "Sent · waiting for iPhone"
        case "running": "Claimed · outcome not yet confirmed"
        case "expired": "Expired without confirmation"
        case "failed": "Could not schedule"
        case "cancelled": "Cancelled"
        default: "Outcome unknown · check iPhone"
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(action.title, systemImage: action.kind == "timer" ? "timer" : "alarm")
            Text("\(action.deviceName) · \(status)").font(.footnote).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
