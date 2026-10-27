import SwiftUI
import UserNotifications
import UIKit
import Observation

@MainActor
@Observable
final class PushNotifications {
    struct Destination: Equatable {
        let id = UUID()
        let contactID: String
        let userID: String
    }

    static let shared = PushNotifications()
    private(set) var deviceToken: String?
    private(set) var status = "Not enabled"
    private(set) var badgeStatus = "Not enabled"
    private var desiredBadgeCount = 0
    private var appliedBadgeCount: Int?
    private var isUpdatingBadge = false
    private(set) var error: String?
    private(set) var isBusy = false
    var destination: Destination?
    private var permissionRequestInFlight = false

    private var environment: String? {
        Bundle.main.object(forInfoDictionaryKey: "WildcardPushEnvironment") as? String
    }

    func received(token: Data) {
        deviceToken = token.map { String(format: "%02x", $0) }.joined()
    }

    func registrationFailed() {
        status = "Registration failed"
        error = "Unable to register for notifications. Check your connection and try again."
    }

    func activate(using auth: AuthStore, requestPermission: Bool = false) async {
        guard auth.state == .signedIn, !permissionRequestInFlight else { return }
        let center = UNUserNotificationCenter.current()
        var settings = await center.notificationSettings()
        // Re-register every requested interaction explicitly, including on installations
        // where an earlier alert-only request reports badgeSetting as notSupported.
        if requestPermission && settings.authorizationStatus != .denied {
            permissionRequestInFlight = true
            do { _ = try await center.requestAuthorization(options: [.alert, .sound, .badge]) }
            catch {
                permissionRequestInFlight = false
                self.error = "Unable to request notification permission. Please try again."
                return
            }
            permissionRequestInFlight = false
            settings = await center.notificationSettings()
        }
        guard auth.state == .signedIn else { return }
        switch settings.badgeSetting {
        case .enabled: badgeStatus = "Enabled"
        case .disabled: badgeStatus = "Disabled in Settings"
        case .notSupported: badgeStatus = "Unavailable on this installation"
        @unknown default: badgeStatus = "Unknown"
        }
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            status = "Connecting…"
            UIApplication.shared.registerForRemoteNotifications()
            await synchronize(using: auth)
        case .denied:
            status = "Disabled in Settings"
            await synchronize(using: auth, remove: true)
        default:
            status = "Not enabled"
        }
    }

    func synchronize(using auth: AuthStore, remove: Bool = false) async {
        guard let deviceToken, !isBusy, auth.state == .signedIn else { return }
        guard let environment, ["development", "production"].contains(environment) else {
            error = "The push environment is missing from the app configuration."
            return
        }
        isBusy = true
        error = nil
        defer { isBusy = false }
        do {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            let allowed = [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus)
            let shouldRemove = remove || !allowed
            let body = try JSONEncoder().encode(["token": deviceToken, "environment": environment])
            try await auth.withSession { api, token in
                _ = try await api.send(path: "push/device", method: shouldRemove ? "DELETE" : "PUT", body: body, token: token)
            }
            if !shouldRemove { status = "Enabled" }
        } catch is CancellationError { }
        catch { self.error = "Unable to update notifications. Open the app or tap Enable notifications to retry." }
    }

    func updateBadge(count: Int) async {
        desiredBadgeCount = max(0, count)
        guard !isUpdatingBadge else { return }
        isUpdatingBadge = true
        defer { isUpdatingBadge = false }
        // APNs can change the icon while suspended, so always reapply on activation.
        var needsApply = true
        while needsApply || appliedBadgeCount != desiredBadgeCount {
            needsApply = false
            let current = desiredBadgeCount
            do {
                try await UNUserNotificationCenter.current().setBadgeCount(current)
                appliedBadgeCount = current
            } catch {
                badgeStatus = "Unable to update. Check Settings."
                return
            }
        }
    }

    func clearAccountState() {
        MessageSounds.shared.reset()
        destination = nil
        error = nil
        status = "Not enabled"
        badgeStatus = "Not enabled"
        desiredBadgeCount = 0
        Task { await updateBadge(count: desiredBadgeCount) }
        // APNs tokens identify this installation, and must be registered on every sign-in.
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
}

@MainActor
final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushNotifications.shared.received(token: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushNotifications.shared.registrationFailed()
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                           withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void) {
        let contactID = notification.request.content.userInfo["contactID"] as? String
        let userID = notification.request.content.userInfo["userID"] as? String
        let turnID = notification.request.content.userInfo["turnID"] as? String
        let deliveredAt = notification.date
        DispatchQueue.main.async {
            defer { completionHandler([]) }
            guard let contactID, let userID, let turnID else { return }
            MessageSounds.shared.received(turnID: turnID, contactID: contactID, userID: userID,
                                          completedAt: deliveredAt)
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                           withCompletionHandler completionHandler: @escaping @Sendable () -> Void) {
        let opensConversation = response.actionIdentifier == UNNotificationDefaultActionIdentifier
        let contactID = response.notification.request.content.userInfo["contactID"] as? String
        let userID = response.notification.request.content.userInfo["userID"] as? String
        // UIKit's completion can update its state-restoration snapshot. The async
        // delegate bridge completed on a background executor and crashed there.
        // Keep both routing and completion on the main queue, including ignored actions.
        DispatchQueue.main.async {
            defer { completionHandler() }
            guard opensConversation, let contactID, let userID else { return }
            PushNotifications.shared.destination = .init(contactID: contactID, userID: userID)
        }
    }
}
