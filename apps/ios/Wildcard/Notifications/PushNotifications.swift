import SwiftUI
import UserNotifications
import UIKit
import Observation

@MainActor
@Observable
final class PushNotifications {
    enum Conversation: Equatable { case contact(String), group(String) }
    struct Destination: Equatable {
        let id = UUID()
        let conversation: Conversation
        let userID: String
    }

    static let shared = PushNotifications()
    private(set) var deviceToken: String?
    private(set) var status = String(localized: "Not enabled")
    private(set) var badgeStatus = String(localized: "Not enabled")
    /// Use this, not `badgeStatus` (localized display text), to decide whether to offer enabling the badge.
    private(set) var isBadgeEnabled = false
    private var desiredBadgeCount = 0
    private var appliedBadgeCount: Int?
    private var isUpdatingBadge = false
    private(set) var error: String?
    private(set) var isBusy = false
    var destination: Destination?
    private(set) var incomingEvent: Destination?

    func receivedForeground(_ conversation: Conversation, userID: String) {
        guard MessageSounds.shared.userID == userID else { return }
        incomingEvent = Destination(conversation: conversation, userID: userID)
    }
    private var permissionRequestInFlight = false
    private var scheduledGroupMessages: Set<String> = []
    private var presentedGroupMessages: Set<String> = []
    private var groupReadSequences: [String: Int] = [:]

    private var environment: String? {
        Bundle.main.object(forInfoDictionaryKey: "WildcardPushEnvironment") as? String
    }

    func received(token: Data) {
        deviceToken = token.map { String(format: "%02x", $0) }.joined()
    }

    func registrationFailed() {
        status = String(localized: "Registration failed")
        error = String(localized: "Unable to register for notifications. Check your connection and try again.")
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
                self.error = String(localized: "Unable to request notification permission. Please try again.")
                return
            }
            permissionRequestInFlight = false
            settings = await center.notificationSettings()
        }
        guard auth.state == .signedIn else { return }
        switch settings.badgeSetting {
        case .enabled: badgeStatus = String(localized: "Enabled")
        case .disabled: badgeStatus = String(localized: "Disabled in Settings")
        case .notSupported: badgeStatus = String(localized: "Unavailable on this installation")
        @unknown default: badgeStatus = String(localized: "Unknown")
        }
        isBadgeEnabled = settings.badgeSetting == .enabled
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            status = String(localized: "Connecting…")
            UIApplication.shared.registerForRemoteNotifications()
            await synchronize(using: auth)
        case .denied:
            status = String(localized: "Disabled in Settings")
            await synchronize(using: auth, remove: true)
        default:
            status = String(localized: "Not enabled")
        }
    }

    func synchronize(using auth: AuthStore, remove: Bool = false) async {
        guard let deviceToken, !isBusy, auth.state == .signedIn else { return }
        guard let environment, ["development", "production"].contains(environment) else {
            error = String(localized: "The push environment is missing from the app configuration.")
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
            if !shouldRemove { status = String(localized: "Enabled") }
        } catch is CancellationError { }
        // Activation and token changes retry registration; connectivity blips stay silent.
        catch where AuthAPI.isTransient(error) { }
        catch { self.error = String(localized: "Unable to update notifications. Open the app or tap Enable notifications to retry.") }
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
                badgeStatus = String(localized: "Unable to update. Check Settings.")
                isBadgeEnabled = false
                return
            }
        }
    }

    func noteGroupRead(id: String, sequence: Int, userID: String) {
        guard MessageSounds.shared.userID == userID, sequence > (groupReadSequences[id] ?? 0) else { return }
        groupReadSequences[id] = sequence
        Task {
            let center = UNUserNotificationCenter.current()
            let delivered = await center.deliveredNotifications()
            let read = delivered.filter {
                let info = $0.request.content.userInfo
                return info["groupID"] as? String == id && info["userID"] as? String == userID
                    && (info["sequence"] as? Int).map { $0 <= sequence } == true
            }
            center.removeDeliveredNotifications(withIdentifiers: read.map { $0.request.identifier })
        }
    }

    func groupPresentation(groupID: String, userID: String, messageID: String, sequence: Int, sentAt: Date) -> UNNotificationPresentationOptions {
        guard MessageSounds.shared.canNotify(userID: userID, completedAt: sentAt),
              sequence > (groupReadSequences[groupID] ?? 0),
              MessageSounds.shared.visibleContactID != MessageSounds.groupConversationID(groupID),
              presentedGroupMessages.insert(messageID).inserted else { return [] }
        MessageSounds.shared.receivedGroup(messageID: messageID, groupID: groupID, userID: userID, completedAt: sentAt)
        return [.banner, .list]
    }

    func presentGroupActivity(_ activity: GroupActivity, userID: String) {
        let sentAt = Date(timeIntervalSince1970: activity.sentAt / 1000)
        guard MessageSounds.shared.canNotify(userID: userID, completedAt: sentAt),
              activity.sequence > (groupReadSequences[activity.groupID] ?? 0),
              MessageSounds.shared.visibleContactID != MessageSounds.groupConversationID(activity.groupID),
              !presentedGroupMessages.contains(activity.messageID),
              scheduledGroupMessages.insert(activity.messageID).inserted else { return }
        MessageSounds.shared.receivedGroup(messageID: activity.messageID, groupID: activity.groupID, userID: userID, completedAt: sentAt)
        let content = UNMutableNotificationContent()
        content.title = activity.groupName
        content.subtitle = activity.senderName
        content.body = activity.previewText ?? (activity.agentID != nil ? MessageMarkdown.plainText(activity.text) : activity.text)
        content.threadIdentifier = "group-\(activity.groupID)"
        content.userInfo = ["groupID": activity.groupID, "userID": userID, "messageID": activity.messageID,
                            "sequence": activity.sequence, "sentAt": activity.sentAt]
        let identifier = "foreground-group-\(activity.messageID)"
        Task {
            guard MessageSounds.shared.canNotify(userID: userID, completedAt: sentAt),
                  activity.sequence > (groupReadSequences[activity.groupID] ?? 0) else { return }
            do { try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil)) }
            catch { /* Polling already played the foreground sound; system alerts may be disabled. */ }
            if MessageSounds.shared.userID != userID || activity.sequence <= (groupReadSequences[activity.groupID] ?? 0) {
                UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [identifier])
                UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
            }
        }
    }

    func clearAccountState() {
        MessageSounds.shared.reset()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: scheduledGroupMessages.map { "foreground-group-\($0)" })
        scheduledGroupMessages.removeAll()
        presentedGroupMessages.removeAll()
        groupReadSequences.removeAll()
        destination = nil
        incomingEvent = nil
        error = nil
        status = String(localized: "Not enabled")
        badgeStatus = String(localized: "Not enabled")
        isBadgeEnabled = false
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
        let groupID = notification.request.content.userInfo["groupID"] as? String
        let messageID = notification.request.content.userInfo["messageID"] as? String
        let sequence = notification.request.content.userInfo["sequence"] as? Int
        let sentAt = notification.request.content.userInfo["sentAt"] as? Double
        let isNativeAction = notification.request.content.userInfo["nativeActionID"] != nil
        let isLocalActivity = notification.request.identifier.hasPrefix("foreground-group-")
        DispatchQueue.main.async {
            guard let userID else { completionHandler([]); return }
            if let groupID {
                if isLocalActivity, let messageID, let sequence, let sentAt {
                    completionHandler(PushNotifications.shared.groupPresentation(groupID: groupID, userID: userID,
                        messageID: messageID, sequence: sequence, sentAt: Date(timeIntervalSince1970: sentAt / 1000)))
                } else {
                    PushNotifications.shared.receivedForeground(.group(groupID), userID: userID)
                    completionHandler([])
                }
                return
            }
            if let contactID, turnID != nil || isNativeAction {
                PushNotifications.shared.receivedForeground(.contact(contactID), userID: userID)
            }
            completionHandler([])
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                           withCompletionHandler completionHandler: @escaping @Sendable () -> Void) {
        let opensConversation = response.actionIdentifier == UNNotificationDefaultActionIdentifier
        let contactID = response.notification.request.content.userInfo["contactID"] as? String
        let userID = response.notification.request.content.userInfo["userID"] as? String
        let groupID = response.notification.request.content.userInfo["groupID"] as? String
        // UIKit's completion can update its state-restoration snapshot. The async
        // delegate bridge completed on a background executor and crashed there.
        // Keep both routing and completion on the main queue, including ignored actions.
        DispatchQueue.main.async {
            defer { completionHandler() }
            guard opensConversation, let userID else { return }
            if let groupID { PushNotifications.shared.destination = .init(conversation: .group(groupID), userID: userID) }
            else if let contactID { PushNotifications.shared.destination = .init(conversation: .contact(contactID), userID: userID) }
        }
    }
}
