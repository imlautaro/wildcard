import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

@main struct WildcardWidgetBundle: WidgetBundle {
    var body: some Widget {
        // Deprecated focus/recipe widget retained below, excluded from the bundle.
        // WildcardSessionWidget()
        WildcardAlarmWidget()
        WildcardContactWidget()
    }
}
struct WildcardSessionWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ContactSessionAttributes.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    NativeGlyph(kind: context.attributes.kind, size: 40)
                    SessionHeading(attributes: context.attributes)
                    Spacer(minLength: 8)
                    SessionMetric(context: context, large: true)
                }
                SessionDetail(context: context)
                SessionButtons(context: context)
            }
            .padding(16)
            .activitySystemActionForegroundColor(NativeStyle.accent)
            .widgetURL(URL(string: "wildcard://native/contact?contactID=\(context.attributes.contactID)"))
            .privacySensitive()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    NativeGlyph(kind: context.attributes.kind, size: 36).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SessionMetric(context: context, large: true).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    SessionHeading(attributes: context.attributes)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 10) {
                        SessionDetail(context: context)
                        SessionButtons(context: context)
                    }.padding(.top, 4).privacySensitive()
                }
            } compactLeading: {
                Image(systemName: NativeStyle.symbol(for: context.attributes.kind))
                    .foregroundStyle(NativeStyle.tint(for: context.attributes.kind))
            } compactTrailing: {
                SessionMetric(context: context, large: false)
            } minimal: {
                Image(systemName: NativeStyle.symbol(for: context.attributes.kind))
                    .foregroundStyle(NativeStyle.tint(for: context.attributes.kind))
            }
            .widgetURL(URL(string: "wildcard://native/contact?contactID=\(context.attributes.contactID)"))
            .keylineTint(NativeStyle.tint(for: context.attributes.kind))
        }
    }
}
private struct SessionHeading: View {
    let attributes: ContactSessionAttributes
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(attributes.title).font(.headline).lineLimit(1)
            Text("\(attributes.contactName) · \(attributes.kind == "recipe" ? "Recipe" : "Focus")")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}
/// The countdown or step counter shown beside the heading and in the compact island.
private struct SessionMetric: View {
    let context: ActivityViewContext<ContactSessionAttributes>
    let large: Bool
    var body: some View {
        Group {
            if context.isStale {
                Image(systemName: "exclamationmark.circle")
            } else if context.attributes.kind == "recipe" {
                Text("\(min(context.state.step + 1, context.attributes.steps.count))/\(context.attributes.steps.count)")
            } else if let end = context.state.endDate, end > .now {
                Text(timerInterval: Date.now...end, countsDown: true)
            } else if let remaining = context.state.pausedRemaining {
                if large { Text(NativeStyle.remaining(remaining)).opacity(0.6) } else { Image(systemName: "pause.fill") }
            } else {
                Image(systemName: "checkmark")
            }
        }
        .font(large ? .system(.title, design: .rounded, weight: .semibold) : .system(.body, design: .rounded, weight: .semibold))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .foregroundStyle(NativeStyle.tint(for: context.attributes.kind))
        .frame(maxWidth: large ? 120 : 52, alignment: .trailing)
    }
}
private struct SessionDetail: View {
    let context: ActivityViewContext<ContactSessionAttributes>
    var body: some View {
        let steps = context.attributes.steps
        if context.isStale {
            Text("Open Wildcard to check this session.").font(.subheadline).foregroundStyle(.secondary)
        } else if context.attributes.kind == "recipe", steps.indices.contains(context.state.step) {
            VStack(alignment: .leading, spacing: 8) {
                Text(steps[context.state.step]).font(.subheadline).lineLimit(3)
                ProgressView(value: Double(context.state.step + 1), total: Double(steps.count))
                    .tint(NativeStyle.tint(for: "recipe"))
            }
        } else if context.state.pausedRemaining != nil {
            Label("Paused", systemImage: "pause.circle.fill").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        } else if context.state.endDate.map({ $0 <= .now }) ?? true {
            Label("Session complete", systemImage: "checkmark.circle.fill").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
    }
}
private struct SessionButtons: View {
    let context: ActivityViewContext<ContactSessionAttributes>
    var body: some View {
        HStack(spacing: 8) {
            if context.attributes.kind == "recipe" {
                Button(intent: ChangeContactSessionIntent(activityID: context.activityID, action: "next")) {
                    ActivityButtonLabel(title: "Next step", symbol: "forward.fill", prominent: true)
                }
            } else {
                let paused = context.state.endDate == nil
                Button(intent: ChangeContactSessionIntent(activityID: context.activityID, action: "pause")) {
                    ActivityButtonLabel(title: paused ? "Resume" : "Pause", symbol: paused ? "play.fill" : "pause.fill", prominent: true)
                }
            }
            Button(intent: ChangeContactSessionIntent(activityID: context.activityID, action: "finish")) {
                ActivityButtonLabel(title: "Finish", symbol: "xmark", prominent: false)
            }
        }
        .buttonStyle(.plain)
    }
}
private struct ActivityButtonLabel: View {
    let title: String
    let symbol: String
    let prominent: Bool
    var tint: Color = NativeStyle.accent
    var body: some View {
        Label(title, systemImage: symbol)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: 36)
            .foregroundStyle(prominent ? Color.white : Color.primary)
            .background(prominent ? AnyShapeStyle(tint) : AnyShapeStyle(.fill.secondary), in: Capsule())
    }
}
struct ContactEntry: TimelineEntry { let date: Date; let directory: NativeDirectory? }
struct ContactProvider: TimelineProvider {
    func placeholder(in context: Context) -> ContactEntry { ContactEntry(date: .now, directory: nil) }
    func getSnapshot(in context: Context, completion: @escaping (ContactEntry) -> Void) { completion(ContactEntry(date: .now, directory: NativeShared.directory)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ContactEntry>) -> Void) {
        completion(Timeline(entries: [ContactEntry(date: .now, directory: NativeShared.directory)], policy: .after(Date.now.addingTimeInterval(900))))
    }
}
struct WildcardContactWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WildcardContacts", provider: ContactProvider()) { entry in
            ContactWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget).privacySensitive()
        }
        .configurationDisplayName("Wildcard contacts")
        .description("Open contacts enabled for native experiments on this device.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
private struct ContactWidgetView: View {
    let entry: ContactEntry
    @Environment(\.widgetFamily) private var family
    var body: some View {
        let contacts = Array((entry.directory?.contacts ?? []).prefix(family == .systemSmall ? 3 : 4))
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "bubble.left.and.bubble.right.fill").foregroundStyle(NativeStyle.accent)
                Text("Wildcard").font(.subheadline.weight(.bold))
            }
            if contacts.isEmpty {
                Spacer(minLength: 0)
                Text("Enable a contact in Native experiments.").font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else if family == .systemSmall {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(contacts) { contact in
                        Link(destination: URL(string: "wildcard://native/contact?contactID=\(contact.id)")!) {
                            HStack(spacing: 8) {
                                ContactInitials(name: contact.name, size: 24)
                                Text(contact.name).font(.footnote.weight(.semibold)).lineLimit(1)
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                HStack(alignment: .top, spacing: 8) {
                    ForEach(contacts) { contact in
                        Link(destination: URL(string: "wildcard://native/contact?contactID=\(contact.id)")!) {
                            VStack(spacing: 6) {
                                ContactInitials(name: contact.name, size: 48)
                                Text(contact.name).font(.caption.weight(.semibold)).lineLimit(1)
                            }.frame(maxWidth: .infinity)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
/// Matches the app's gray placeholder avatar; photos are not shared with the extension.
private struct ContactInitials: View {
    let name: String
    let size: CGFloat
    var body: some View {
        Text(name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased())
            .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [Color(red: 0.65, green: 0.67, blue: 0.71), Color(red: 0.52, green: 0.54, blue: 0.58)], startPoint: .top, endPoint: .bottom), in: Circle())
    }
}

import AlarmKit
struct WildcardAlarmWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<WildcardAlarmMetadata>.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    NativeGlyph(kind: "alarm", size: 40, symbol: AlarmStyle.symbol(context.state))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.presentation.alert.title).font(.headline).lineLimit(1)
                        AlarmCaption(state: context.state)
                    }
                    Spacer(minLength: 8)
                    AlarmMetric(state: context.state, large: true)
                }
                AlarmProgress(state: context.state)
                AlarmButtons(state: context.state)
            }
            .padding(16)
            .activitySystemActionForegroundColor(NativeStyle.tint(for: "alarm"))
            .privacySensitive()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    NativeGlyph(kind: "alarm", size: 36, symbol: AlarmStyle.symbol(context.state)).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) { AlarmMetric(state: context.state, large: true).padding(.trailing, 4) }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.presentation.alert.title).font(.headline).lineLimit(1)
                        AlarmCaption(state: context.state)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) { AlarmProgress(state: context.state); AlarmButtons(state: context.state) }
                        .padding(.top, 4).privacySensitive()
                }
            } compactLeading: {
                Image(systemName: AlarmStyle.symbol(context.state)).foregroundStyle(NativeStyle.tint(for: "alarm"))
            } compactTrailing: {
                AlarmMetric(state: context.state, large: false)
            } minimal: {
                Image(systemName: AlarmStyle.symbol(context.state)).foregroundStyle(NativeStyle.tint(for: "alarm"))
            }
            .keylineTint(NativeStyle.tint(for: "alarm"))
        }
    }
}
private enum AlarmStyle {
    static func symbol(_ state: AlarmPresentationState) -> String {
        switch state.mode {
        case .countdown, .paused: "timer"
        default: "alarm.fill"
        }
    }
}
private struct AlarmCaption: View {
    let state: AlarmPresentationState
    var body: some View {
        Group {
            switch state.mode {
            case .countdown: Text("Timer")
            case .paused: Text("Paused")
            case .alert: Text("Ringing now")
            @unknown default: Text("Alarm")
            }
        }.font(.caption).foregroundStyle(.secondary).lineLimit(1)
    }
}
private struct AlarmMetric: View {
    let state: AlarmPresentationState
    let large: Bool
    var body: some View {
        Group {
            switch state.mode {
            case .countdown(let countdown):
                if countdown.fireDate > .now { Text(timerInterval: Date.now...countdown.fireDate, countsDown: true) }
                else { Text("Time's up") }
            case .paused(let paused):
                if large { Text(NativeStyle.remaining(paused.totalCountdownDuration - paused.previouslyElapsedDuration)).opacity(0.6) }
                else { Image(systemName: "pause.fill") }
            case .alert: Image(systemName: "bell.and.waves.left.and.right.fill")
            @unknown default: Image(systemName: "alarm")
            }
        }
        .font(large ? .system(.title, design: .rounded, weight: .semibold) : .system(.body, design: .rounded, weight: .semibold))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .foregroundStyle(NativeStyle.tint(for: "alarm"))
        .frame(maxWidth: large ? 120 : 52, alignment: .trailing)
    }
}
private struct AlarmProgress: View {
    let state: AlarmPresentationState
    var body: some View {
        switch state.mode {
        case .countdown(let countdown) where countdown.fireDate > .now && countdown.totalCountdownDuration > 0:
            ProgressView(timerInterval: countdown.fireDate.addingTimeInterval(-countdown.totalCountdownDuration)...countdown.fireDate,
                         countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .tint(NativeStyle.tint(for: "alarm"))
        case .paused(let paused) where paused.totalCountdownDuration > 0:
            ProgressView(value: max(0, paused.totalCountdownDuration - paused.previouslyElapsedDuration), total: paused.totalCountdownDuration)
                .tint(.secondary)
        default: EmptyView()
        }
    }
}
private struct AlarmButtons: View {
    let state: AlarmPresentationState
    var body: some View {
        HStack(spacing: 8) {
            switch state.mode {
            case .countdown:
                Button(intent: ControlWildcardAlarmIntent(alarmID: state.alarmID, action: "pause")) {
                    ActivityButtonLabel(title: "Pause", symbol: "pause.fill", prominent: true, tint: NativeStyle.tint(for: "alarm"))
                }
            case .paused:
                Button(intent: ControlWildcardAlarmIntent(alarmID: state.alarmID, action: "resume")) {
                    ActivityButtonLabel(title: "Resume", symbol: "play.fill", prominent: true, tint: NativeStyle.tint(for: "alarm"))
                }
            default: EmptyView()
            }
            Button(intent: ControlWildcardAlarmIntent(alarmID: state.alarmID, action: "stop")) {
                ActivityButtonLabel(title: "Cancel", symbol: "xmark", prominent: false)
            }
        }
        .buttonStyle(.plain)
    }
}
