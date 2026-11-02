import Foundation
import UserNotifications
import AlarmKit
import SwiftUI
import OSLog

private struct RemoteCommand: Decodable {
    let id: String
    let userID: String
    let contactID: String
    let deviceID: String
    let kind: String
    let payloadJSON: String
    let expiresAt: Double
    let fireAt: Double
    let executionID: String
}
private struct RemoteAlarmPayload: Decodable { let kind: String; let title: String }

/// Called only for a visible APNs alert. A claim is never replayed after uncertainty.
enum RemoteNativeExecution {
    private static let logger = Logger(subsystem: "com.imlautaro.Wildcard.NotificationService", category: "RemoteNative")
    static func handle(_ content: UNNotificationContent) async -> UNNotificationContent {
        guard let actionID = content.userInfo["nativeActionID"] as? String,
              let ticket = content.userInfo["nativeTicket"] as? String,
              let userID = content.userInfo["userID"] as? String,
              let contactID = content.userInfo["contactID"] as? String,
              let deviceID = content.userInfo["deviceID"] as? String,
              actionID.count <= 100, ticket.count == 64,
              let local = RemoteNativeShared.configuration, local.userID == userID, local.deviceID == deviceID,
              !(local.contacts[contactID] ?? []).isEmpty else { return result(content, String(localized: "Remote action unavailable on this iPhone.")) }
        let executionID = UUID().uuidString.lowercased()
        var claimed = false
        var stage = "claim"
        do {
            let command = try await update(actionID: actionID, ticket: ticket, deviceID: deviceID, executionID: executionID, status: "running")
            claimed = true
            stage = "validation"
            let rejection: String?
            if command.userID != userID || command.contactID != contactID || command.deviceID != deviceID
                || command.id != actionID || command.executionID != executionID {
                rejection = String(localized: "The remote request does not match this iPhone.")
            } else if !["timer", "alarm"].contains(command.kind) {
                rejection = String(localized: "This remote action is not supported.")
            } else if command.expiresAt <= Date.now.timeIntervalSince1970 * 1000 {
                rejection = String(localized: "The remote request expired before scheduling. Ask for a new timer or alarm.")
            } else if command.fireAt <= Date.now.timeIntervalSince1970 * 1000 {
                rejection = String(localized: "The requested timer or alarm deadline has already passed.")
            } else if !allowed(userID: userID, deviceID: deviceID, contactID: contactID, kind: command.kind) {
                rejection = String(localized: "Remote access for this contact or tool is disabled on this iPhone.")
            } else if Task.isCancelled {
                rejection = String(localized: "Notification processing was interrupted before scheduling.")
            } else { rejection = nil }
            if let rejection {
                logger.notice("Remote action rejected before scheduling: \(rejection, privacy: .public)")
                _ = try? await update(actionID: actionID, ticket: ticket, deviceID: deviceID, executionID: executionID, status: "cancelled")
                return result(content, rejection)
            }
            // The main app checks authorization when enabling the grant. An extension's
            // synchronous snapshot is not proof that scheduling will be denied. Let
            // AlarmKit enforce permission in schedule(); never request permission here.
            let authorization = authorizationLabel()
            logger.info("Remote scheduling attempt; extension authorization snapshot: \(authorization, privacy: .public)")
            let payload = try JSONDecoder().decode(RemoteAlarmPayload.self, from: Data(command.payloadJSON.utf8))
            guard payload.kind == command.kind, !payload.title.isEmpty, payload.title.count <= 100 else { throw URLError(.cannotParseResponse) }
            let remaining = command.fireAt / 1000 - Date.now.timeIntervalSince1970
            guard remaining > 0 else { throw URLError(.timedOut) }
            let title = LocalizedStringResource(stringLiteral: payload.title)
            let presentation = AlarmPresentation(alert: .init(title: title),
                countdown: command.kind == "timer" ? .init(title: title, pauseButton: .init(text: "Pause", textColor: .white, systemImageName: "pause.fill")) : nil,
                paused: command.kind == "timer" ? .init(title: title, resumeButton: .init(text: "Resume", textColor: .white, systemImageName: "play.fill")) : nil)
            let attributes = AlarmAttributes(presentation: presentation, metadata: WildcardAlarmMetadata(contactID: contactID), tintColor: NativeStyle.tint(for: "alarm"))
            let configuration: AlarmManager.AlarmConfiguration<WildcardAlarmMetadata> = command.kind == "timer"
                ? .timer(duration: remaining, attributes: attributes)
                : .alarm(schedule: .fixed(Date(timeIntervalSince1970: command.fireAt / 1000)), attributes: attributes)
            stage = "handoff"
            // Save the ID before scheduling, so a crash cannot hide a possibly successful operation.
            try RemoteNativeShared.remember(RemoteNativeAlarm(id: executionID, userID: userID, contactID: contactID, title: payload.title,
                fireAt: command.fireAt, createdAt: Date.now.timeIntervalSince1970 * 1000))
            guard allowed(userID: userID, deviceID: deviceID, contactID: contactID, kind: command.kind), !Task.isCancelled else { throw CancellationError() }
            stage = "schedule"
            _ = try await AlarmManager.shared.schedule(id: UUID(uuidString: executionID)!, configuration: configuration)
            do {
                _ = try await update(actionID: actionID, ticket: ticket, deviceID: deviceID, executionID: executionID, status: "completed")
                return result(content, String(localized: "\(payload.title) · Scheduled on this iPhone"))
            } catch {
                // Scheduling already succeeded. Never schedule again because acknowledgement failed.
                return result(content, String(localized: "\(payload.title) · Scheduled; server confirmation unavailable"))
            }
        } catch {
            let failure = error as NSError
            let domain = String(failure.domain.prefix(100))
            logger.error("Remote action failed at \(stage, privacy: .public); domain=\(domain, privacy: .public), code=\(failure.code, privacy: .public)")
            if claimed { _ = try? await update(actionID: actionID, ticket: ticket, deviceID: deviceID, executionID: executionID, status: "unknown") }
            // Shown in the notification body; the log above keeps the raw stage identifier.
            let stageLabel = switch stage {
            case "claim": String(localized: "claim", comment: "Remote timer processing stage, inserted into “Unable to confirm this timer or alarm during %@.”")
            case "validation": String(localized: "validation", comment: "Remote timer processing stage, inserted into “Unable to confirm this timer or alarm during %@.”")
            case "handoff": String(localized: "handoff", comment: "Remote timer processing stage, inserted into “Unable to confirm this timer or alarm during %@.”")
            default: stage
            }
            return result(content, stage == "schedule"
                ? String(localized: "AlarmKit could not confirm scheduling in the notification extension (\(domain), \(failure.code)). Check Wildcard before retrying.")
                : String(localized: "Unable to confirm this timer or alarm during \(stageLabel). Check Wildcard before requesting another."))
        }
    }
    private static func authorizationLabel() -> String {
        switch AlarmManager.shared.authorizationState {
        case .authorized: "authorized"
        case .denied: "denied"
        case .notDetermined: "notDetermined"
        @unknown default: "unknown"
        }
    }
    private static func allowed(userID: String, deviceID: String, contactID: String, kind: String) -> Bool {
        guard let config = RemoteNativeShared.configuration else { return false }
        return config.userID == userID && config.deviceID == deviceID && config.contacts[contactID]?.contains(kind) == true
    }
    private static func result(_ content: UNNotificationContent, _ body: String) -> UNNotificationContent {
        guard let modified = content.mutableCopy() as? UNMutableNotificationContent else { return content }
        modified.body = body
        // Do not retain the one-action bearer capability in delivered notification history.
        modified.userInfo.removeValue(forKey: "nativeTicket")
        return modified
    }
    private static func update(actionID: String, ticket: String, deviceID: String, executionID: String, status: String) async throws -> RemoteCommand {
        guard let base = Bundle.main.object(forInfoDictionaryKey: "WildcardAPIURL") as? String,
              let origin = URL(string: base), origin.scheme == "https", origin.user == nil, origin.password == nil,
              let url = URL(string: "api/v1/native-execution/\(actionID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "")", relativeTo: origin.appendingPathComponent("/")) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 6
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Native " + ticket, forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(["deviceID": deviceID, "executionID": executionID, "status": status])
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil; configuration.urlCache = nil
        configuration.timeoutIntervalForResource = 6
        let session = URLSession(configuration: configuration, delegate: RemoteNoRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200, data.count < 8192 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(RemoteCommand.self, from: data)
    }
}
private final class RemoteNoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
