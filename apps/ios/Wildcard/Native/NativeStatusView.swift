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
                    && NativeExperiments.kinds.contains($0.attributes.kind) && !$0.content.state.finished && $0.attributes.expiresAt > .now
            }
            let showSpeech = NativeExperiments.kinds.contains("speech") && native.speaking && (contactID == nil || native.speakingContactID == contactID)
            let count = alarms.count + sessions.count + (showSpeech ? 1 : 0)
            if count > 0 {
                ScrollView(.horizontal, showsIndicators: false) {
                    GlassEffectContainer(spacing: 8) {
                        HStack(alignment: .top, spacing: 8) {
                            ForEach(alarms) { record in
                                if let alarm = native.systemAlarms[record.id] {
                                    alarmCard(record, alarm: alarm).nativeStatusCard(single: count == 1)
                                }
                            }
                            ForEach(sessions, id: \.id) { session in
                                sessionCard(session).nativeStatusCard(single: count == 1)
                            }
                            if showSpeech {
                                NativeStatusRow(kind: "speech", title: "Reading aloud", contactID: nil) {
                                    EmptyView()
                                } controls: {
                                    NativeStatusButton(label: "Stop reading", symbol: "stop.fill", prominent: true) { native.stopSpeaking() }
                                }.nativeStatusCard(single: count == 1)
                            }
                        }
                        .padding(.horizontal).padding(.vertical, 8)
                    }
                }
                .scrollDisabled(count == 1)
            }
        }
    }

    private func sessionCard(_ session: Activity<ContactSessionAttributes>) -> some View {
        NativeStatusRow(kind: session.attributes.kind, title: session.attributes.title, contactID: openContactID(session.attributes.contactID)) {
            NativeSessionContent(attributes: session.attributes, state: session.content.state, compact: true)
        } controls: {
            if session.attributes.kind == "recipe" {
                NativeStatusButton(label: "Next step", symbol: "forward.fill", prominent: true) { change(session, action: "next") }
            } else {
                let paused = session.content.state.endDate == nil
                NativeStatusButton(label: paused ? "Resume" : "Pause", symbol: paused ? "play.fill" : "pause.fill", prominent: true) { change(session, action: "pause") }
            }
            NativeStatusButton(label: "Finish", symbol: "xmark", role: .destructive) { change(session, action: "finish") }
        }
    }

    private func alarmCard(_ record: NativeLocalAlarm, alarm: Alarm) -> some View {
        NativeStatusRow(kind: alarm.countdownDuration == nil ? "alarm" : "timer", title: record.title, contactID: openContactID(record.contactID)) {
            Group {
                if !native.alarmStateAvailable {
                    Text("Status unavailable · last known alarm").manrope(.footnote).foregroundStyle(.secondary)
                } else if alarm.state == .alerting {
                    Text("Ringing now").manrope(.subheadline, weight: .bold).foregroundStyle(NativeStyle.tint(for: "alarm"))
                } else if alarm.state == .paused {
                    Text("Paused").manrope(.subheadline, weight: .semibold).foregroundStyle(.secondary)
                } else if let countdown = countdown(alarm.id), countdown.fireDate > .now {
                    Text(timerInterval: Date.now...countdown.fireDate, countsDown: true)
                        .font(.system(.title3, design: .rounded, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(NativeStyle.tint(for: "timer"))
                } else if case .fixed(let date) = alarm.schedule {
                    Text(date, format: .dateTime.month().day().hour().minute()).manrope(.subheadline, weight: .semibold)
                } else {
                    Text(alarm.state == .countdown ? "Timer running" : "Scheduled").manrope(.footnote).foregroundStyle(.secondary)
                }
            }
        } controls: {
            Group {
                if alarm.state == .countdown {
                    NativeStatusButton(label: "Pause", symbol: "pause.fill", prominent: true) { native.controlLocalAlarm(record, pause: true) }
                } else if alarm.state == .paused {
                    NativeStatusButton(label: "Resume", symbol: "play.fill", prominent: true) { native.controlLocalAlarm(record, pause: false) }
                }
                NativeStatusButton(label: alarm.state == .alerting ? "Stop" : "Cancel", symbol: alarm.state == .alerting ? "stop.fill" : "xmark", role: .destructive) {
                    native.cancelLocalAlarm(record)
                }
            }.disabled(!native.busy.isEmpty || !native.alarmStateAvailable)
        }
    }

    private func countdown(_ id: UUID) -> AlarmPresentationState.Mode.Countdown? {
        for activity in Activity<AlarmAttributes<WildcardAlarmMetadata>>.activities where activity.content.state.alarmID == id {
            if case .countdown(let state) = activity.content.state.mode { return state }
        }
        return nil
    }
    /// The global strip links each card to its chat; inside a chat the card is already in context.
    private func openContactID(_ id: String) -> String? { contactID == nil ? id : nil }
    private func change(_ session: Activity<ContactSessionAttributes>, action: String) {
        Task { _ = try? await ChangeContactSessionIntent(activityID: session.id, action: action).perform() }
    }
}

/// One compact live card: glyph, title, live detail and round controls.
private struct NativeStatusRow<Detail: View, Controls: View>: View {
    let kind: String
    let title: String
    let contactID: String?
    @ViewBuilder let detail: Detail
    @ViewBuilder let controls: Controls
    @Environment(NativeExperiments.self) private var native

    var body: some View {
        HStack(spacing: 12) {
            if let contactID {
                Button { native.route = NativeExperiments.NativeRoute(contactID: contactID, agentID: nil) } label: { summary }
                    .buttonStyle(.plain)
                    .accessibilityHint("Open chat")
            } else {
                summary
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) { controls }
        }
    }

    private var summary: some View {
        HStack(spacing: 10) {
            NativeGlyph(kind: kind, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(title).manrope(.subheadline, weight: .semibold).lineLimit(1)
                    if contactID != nil {
                        Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.tertiary)
                    }
                }
                detail.lineLimit(2)
            }
        }
        .contentShape(Rectangle())
    }
}

private struct NativeStatusButton: View {
    let label: String
    let symbol: String
    var prominent = false
    var role: ButtonRole? = nil
    let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 34

    var body: some View {
        Button(role: role, action: action) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundStyle(prominent ? Color.white : role == .destructive ? Color.red : Color.primary)
                .frame(width: size, height: size)
                .background(prominent ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.fill.tertiary), in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

private extension View {
    func nativeStatusCard(single: Bool) -> some View {
        padding(.leading, 10).padding(.trailing, 8).padding(.vertical, 8)
            .containerRelativeFrame(.horizontal, alignment: .leading) { width, _ in single ? width - 32 : min(width - 56, 340) }
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Visual treatment for a native request status; copy stays with each surface.
enum NativeActionTone {
    case done, working, waiting, attention, failed, inactive

    init(_ action: NativeAction, busy: Bool) {
        let expired = action.expiresAt <= Date.now.timeIntervalSince1970 * 1000
        switch action.status {
        case "completed": self = .done
        case "running": self = busy ? .working : .attention
        case "unknown": self = .attention
        case "failed": self = .failed
        case "cancelled", "expired": self = .inactive
        default: self = expired ? .inactive : .waiting
        }
    }
    var symbol: String {
        switch self {
        case .done: "checkmark.circle.fill"
        case .working: "arrow.triangle.2.circlepath"
        case .waiting: "clock.fill"
        case .attention: "exclamationmark.triangle.fill"
        case .failed: "xmark.octagon.fill"
        case .inactive: "minus.circle.fill"
        }
    }
    var color: Color {
        switch self {
        case .done: .green
        case .working, .waiting: .accentColor
        case .attention: .orange
        case .failed: .red
        case .inactive: .secondary
        }
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
        if NativeExperiments.deprecatedKinds.contains(action.kind), action.status == "pending" {
            return "Deprecated experiment · unavailable"
        }
        return switch action.status {
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
        let tone = NativeActionTone(action, busy: native.busy.contains(action.id))
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                NativeGlyph(kind: action.kind, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(action.payload?.title ?? "Native action").manrope(.subheadline, weight: .semibold)
                        .fixedSize(horizontal: false, vertical: true)
                    Label { Text(status).manrope(.caption) } icon: {
                        Image(systemName: tone.symbol).foregroundStyle(tone.color)
                            .symbolEffect(.rotate, isActive: tone == .working)
                    }
                    .labelStyle(NativeCompactLabelStyle())
                    .foregroundStyle(.secondary)
                }
            }
            if NativeExperiments.kinds.contains(action.kind), action.remoteDeviceID == nil, action.status == "pending", !automatic, action.expiresAt > Date.now.timeIntervalSince1970 * 1000 {
                Button { Task { await native.run(action, contactID: contactID, using: auth) } } label: {
                    Text("Review and run").manrope(.footnote, weight: .semibold).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
                .disabled(!native.busy.isEmpty || native.enabled[contactID]?.contains(action.kind) != true)
            }
            if action.status == "running" && !native.busy.contains(action.id) || ["failed", "unknown"].contains(action.status) {
                NavigationLink(value: HomeDestination.nativeTools(contactID)) {
                    Label("View native requests", systemImage: "chevron.right").labelStyle(NativeTrailingIconLabelStyle())
                        .manrope(.caption, weight: .semibold)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: 340, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.separator.opacity(0.6), lineWidth: 0.5))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
    }
}

struct NativeCompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) { configuration.icon.font(.caption2); configuration.title }
    }
}

private struct NativeTrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 2) { configuration.title; configuration.icon.font(.caption2.weight(.bold)) }
    }
}
