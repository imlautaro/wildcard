#if !WILDCARD_SHARE_EXTENSION && !WILDCARD_NOTIFICATION_EXTENSION
import AppIntents
import ActivityKit
import Foundation

struct ChangeContactSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Update contact session"
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
    @Parameter(title: "Activity") var activityID: String
    @Parameter(title: "Action") var action: String
    init() {}
    init(activityID: String, action: String) { self.activityID = activityID; self.action = action }
    @MainActor func perform() async throws -> some IntentResult {
        guard let activity = Activity<ContactSessionAttributes>.activities.first(where: { $0.id == activityID }),
              NativeShared.directory?.userID == activity.attributes.userID,
              NativeShared.directory?.contacts.contains(where: { $0.id == activity.attributes.contactID }) == true else { return .result() }
        var state = activity.content.state
        guard !state.finished else { return .result() }
        if action == "finish" || activity.attributes.expiresAt <= .now {
            state.finished = true
            await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate)
        } else if action == "next", !activity.attributes.steps.isEmpty {
            if state.step + 1 >= activity.attributes.steps.count {
                state.finished = true
                await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate)
            } else {
                state.step += 1
                await activity.update(ActivityContent(state: state, staleDate: activity.attributes.expiresAt))
            }
        } else if action == "pause" {
            if let end = state.endDate {
                state.pausedRemaining = max(0, end.timeIntervalSinceNow); state.endDate = nil
            } else if let remaining = state.pausedRemaining {
                state.endDate = min(Date.now.addingTimeInterval(remaining), activity.attributes.expiresAt); state.pausedRemaining = nil
            }
            await activity.update(ActivityContent(state: state, staleDate: state.endDate ?? activity.attributes.expiresAt))
        }
        return .result()
    }
}

#endif

#if !WILDCARD_SHARE_EXTENSION && !WILDCARD_NOTIFICATION_EXTENSION
import AlarmKit
struct ControlWildcardAlarmIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Control Wildcard alarm"
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
    @Parameter(title: "Alarm") var alarmID: String
    @Parameter(title: "Action") var action: String
    init() {}
    init(alarmID: UUID, action: String) { self.alarmID = alarmID.uuidString; self.action = action }
    @MainActor func perform() async throws -> some IntentResult {
        guard let id = UUID(uuidString: alarmID) else { return .result() }
        switch action {
        case "pause": try AlarmManager.shared.pause(id: id)
        case "resume": try AlarmManager.shared.resume(id: id)
        case "stop": try AlarmManager.shared.cancel(id: id)
        default: break
        }
        return .result()
    }
}
#endif
