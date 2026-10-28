import Foundation
import AlarmKit
import UserNotifications
import UIKit

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
                  let environment = Bundle.main.object(forInfoDictionaryKey: "WildcardPushEnvironment") as? String else { throw AuthAPI.Failure.rejected("Enable visible notifications, then try again once this iPhone is registered.") }
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
