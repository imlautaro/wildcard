import SwiftUI
import AlarmKit
import ActivityKit

/// Live state comes from the system; operation receipts describe only what the device saved or scheduled.
struct NativeActiveStatusView: View {
    let contactID: String?
    @Environment(NativeExperiments.self) private var native
    @Environment(AuthStore.self) private var auth

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let alarms = native.localAlarms.filter {
                $0.userID == auth.user?.id && (contactID == nil || $0.contactID == contactID)
                    && native.systemAlarms[$0.id] != nil
            }
            let sessions = Activity<ContactSessionAttributes>.activities.filter {
                $0.attributes.userID == auth.user?.id && (contactID == nil || $0.attributes.contactID == contactID)
                    && !$0.content.state.finished && $0.attributes.expiresAt > .now
            }
            let showSpeech = native.speaking && (contactID == nil || native.speakingContactID == contactID)
            if !alarms.isEmpty || !sessions.isEmpty || showSpeech {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(alarms) { record in
                            if let alarm = native.systemAlarms[record.id] {
                                alarmCard(record, alarm: alarm)
                            }
                        }
                        ForEach(sessions, id: \.id) { session in
                            VStack(alignment: .leading, spacing: 6) {
                                Label(session.attributes.title, systemImage: session.attributes.kind == "recipe" ? "book" : "target")
                                    .font(.subheadline.weight(.semibold))
                                NativeSessionContent(attributes: session.attributes, state: session.content.state)
                                    .font(.subheadline)
                                HStack {
                                    if session.attributes.kind == "recipe" {
                                        Button("Next step") { change(session, action: "next") }
                                    } else {
                                        Button(session.content.state.endDate == nil ? "Resume" : "Pause") { change(session, action: "pause") }
                                    }
                                    Button("Finish", role: .destructive) { change(session, action: "finish") }
                                }.buttonStyle(.bordered).font(.caption)
                                openContact(session.attributes.contactID)
                            }.padding(12).frame(width: 270, alignment: .leading).background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
                        }
                        if showSpeech {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Reading aloud", systemImage: "speaker.wave.2")
                                Button("Stop reading") { native.stopSpeaking() }.buttonStyle(.bordered)
                            }.padding(12).background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
                        }
                    }.padding(.horizontal).padding(.vertical, 8)
                }.background(.bar)
            }
        }
    }

    private func alarmCard(_ record: NativeLocalAlarm, alarm: Alarm) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(record.title, systemImage: alarm.countdownDuration == nil ? "alarm" : "timer")
                .font(.subheadline.weight(.semibold))
            if !native.alarmStateAvailable {
                Text("Status unavailable · last known alarm").font(.subheadline)
            } else if alarm.state == .alerting {
                Text("Ringing now").font(.title3.weight(.semibold))
            } else if alarm.state == .paused {
                Text("Paused").font(.title3.weight(.semibold))
            } else if let countdown = countdown(alarm.id), countdown.fireDate > .now {
                Text(timerInterval: Date.now...countdown.fireDate, countsDown: true)
                    .font(.title2.monospacedDigit().weight(.semibold))
            } else if case .fixed(let date) = alarm.schedule {
                Text(date, format: .dateTime.month().day().hour().minute()).font(.subheadline)
            } else {
                Text(alarm.state == .countdown ? "Timer running" : "Scheduled")
                    .font(.subheadline)
            }
            HStack {
                if alarm.state == .countdown {
                    Button("Pause") { native.controlLocalAlarm(record, pause: true) }
                } else if alarm.state == .paused {
                    Button("Resume") { native.controlLocalAlarm(record, pause: false) }
                }
                Button(alarm.state == .alerting ? "Stop" : "Cancel", role: .destructive) { native.cancelLocalAlarm(record) }
            }.buttonStyle(.bordered).font(.caption).disabled(!native.busy.isEmpty || !native.alarmStateAvailable)
            openContact(record.contactID)
        }.padding(12).frame(width: 250, alignment: .leading).background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }

    private func countdown(_ id: UUID) -> AlarmPresentationState.Mode.Countdown? {
        for activity in Activity<AlarmAttributes<WildcardAlarmMetadata>>.activities where activity.content.state.alarmID == id {
            if case .countdown(let state) = activity.content.state.mode { return state }
        }
        return nil
    }
    @ViewBuilder private func openContact(_ id: String) -> some View {
        if contactID == nil {
            Button("Open chat") { native.route = NativeExperiments.NativeRoute(contactID: id, agentID: nil) }.font(.caption)
        }
    }
    private func change(_ session: Activity<ContactSessionAttributes>, action: String) {
        Task { _ = try? await ChangeContactSessionIntent(activityID: session.id, action: action).perform() }
    }
}

struct NativeActionReceiptView: View {
    let action: NativeAction
    let contactID: String
    @Environment(NativeExperiments.self) private var native
    @Environment(AuthStore.self) private var auth
    private var automatic: Bool {
        guard let since = native.automaticSince[contactID]?[action.kind] else { return false }
        return action.createdAt >= since
    }
    private var status: String {
        switch action.status {
        case "completed":
            switch action.kind {
            case "timer": "Timer scheduled on this iPhone"
            case "alarm": "Alarm scheduled on this iPhone"
            case "focus", "recipe": "Live session started on this iPhone"
            case "calendar": "Event saved on this iPhone"
            case "reminder", "location_reminder": "Reminder saved on this iPhone"
            case "speech": "Reading finished on this iPhone"
            default: "Completed on this iPhone"
            }
        case "running": native.busy.contains(action.id) ? "Running on this iPhone…" : "Outcome not confirmed · check before retrying"
        case "cancelled": "Cancelled"
        case "failed": "Could not complete on this iPhone"
        case "unknown": "Outcome unknown · check the system app"
        default: action.remoteDeviceID != nil && action.expiresAt > Date.now.timeIntervalSince1970 * 1000 ? "Sent to iPhone · awaiting device confirmation" : action.expiresAt <= Date.now.timeIntervalSince1970 * 1000 ? "Expired" : automatic ? "Waiting for automatic execution…" : "Ready for review"
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(action.payload?.title ?? "Native action", systemImage: action.status == "completed" ? "checkmark.circle" : "iphone")
                .font(.subheadline.weight(.semibold))
            Text(status).font(.caption).foregroundStyle(.secondary)
            if action.remoteDeviceID == nil, action.status == "pending", !automatic, action.expiresAt > Date.now.timeIntervalSince1970 * 1000 {
                Button("Review and run") { Task { await native.run(action, contactID: contactID, using: auth) } }
                    .buttonStyle(.bordered).disabled(!native.busy.isEmpty || native.enabled[contactID]?.contains(action.kind) != true)
            }
            if action.status == "running" && !native.busy.contains(action.id) || ["failed", "unknown"].contains(action.status) {
                NavigationLink("View native requests", value: HomeDestination.nativeTools(contactID)).font(.caption)
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}
