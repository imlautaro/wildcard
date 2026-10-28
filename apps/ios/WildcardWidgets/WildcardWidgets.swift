import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

@main struct WildcardWidgetBundle: WidgetBundle {
    var body: some Widget { WildcardSessionWidget(); WildcardAlarmWidget(); WildcardContactWidget() }
}
struct WildcardSessionWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ContactSessionAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                Text(context.attributes.contactName).font(.caption).foregroundStyle(.secondary)
                Text(context.attributes.title).font(.headline)
                SessionStatus(context: context)
                SessionButtons(context: context)
            }.padding().activityBackgroundTint(.black.opacity(0.85)).activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "wildcard://native/contact?contactID=\(context.attributes.contactID)"))
                .privacySensitive()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: context.attributes.kind == "recipe" ? "fork.knife" : "timer") }
                DynamicIslandExpandedRegion(.trailing) { Text(context.attributes.contactName).font(.caption).lineLimit(1) }
                DynamicIslandExpandedRegion(.center) { Text(context.attributes.title).font(.headline).lineLimit(1) }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) { SessionStatus(context: context); SessionButtons(context: context) }.privacySensitive()
                }
            } compactLeading: {
                Image(systemName: context.attributes.kind == "recipe" ? "fork.knife" : "timer")
            } compactTrailing: {
                if context.attributes.kind == "recipe" { Text("\(context.state.step + 1)/\(context.attributes.steps.count)") }
                else if let end = context.state.endDate, end > .now {
                    Text(timerInterval: Date.now...end, countsDown: true).monospacedDigit().frame(maxWidth: 48)
                } else { Image(systemName: context.state.pausedRemaining == nil ? "checkmark" : "pause.fill") }
            } minimal: {
                Image(systemName: context.attributes.kind == "recipe" ? "fork.knife" : "timer")
            }
            .widgetURL(URL(string: "wildcard://native/contact?contactID=\(context.attributes.contactID)"))
            .keylineTint(.blue)
        }
    }
}
private struct SessionStatus: View {
    let context: ActivityViewContext<ContactSessionAttributes>
    var body: some View {
        if context.isStale { Text("Open Wildcard to check this session.").font(.caption) }
        else if context.attributes.kind == "recipe", context.attributes.steps.indices.contains(context.state.step) {
            Text(context.attributes.steps[context.state.step]).lineLimit(3)
        } else if let end = context.state.endDate, end > .now {
            Text(timerInterval: Date.now...end, countsDown: true).font(.title2).monospacedDigit()
        } else { Text(context.state.pausedRemaining == nil ? "Session complete" : "Paused") }
    }
}
private struct SessionButtons: View {
    let context: ActivityViewContext<ContactSessionAttributes>
    var body: some View {
        HStack {
            if context.attributes.kind == "recipe" {
                Button("Next step", intent: ChangeContactSessionIntent(activityID: context.activityID, action: "next"))
            } else {
                Button(context.state.endDate == nil ? "Resume" : "Pause", intent: ChangeContactSessionIntent(activityID: context.activityID, action: "pause"))
            }
            Button("Finish", intent: ChangeContactSessionIntent(activityID: context.activityID, action: "finish"))
        }.buttonStyle(.bordered).tint(.white)
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
            VStack(alignment: .leading, spacing: 8) {
                Label("Wildcard", systemImage: "bubble.left.and.bubble.right").font(.headline)
                if let contacts = entry.directory?.contacts, !contacts.isEmpty {
                    ForEach(Array(contacts.prefix(3))) { contact in
                        Link(destination: URL(string: "wildcard://native/contact?contactID=\(contact.id)")!) {
                            Label(contact.name, systemImage: "person.crop.circle").lineLimit(1)
                        }
                    }
                } else { Text("Enable a contact in Native experiments.").font(.caption).foregroundStyle(.secondary) }
            }.containerBackground(.fill.tertiary, for: .widget).privacySensitive()
        }
        .configurationDisplayName("Wildcard contacts")
        .description("Open contacts enabled for native experiments on this device.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

import AlarmKit
struct WildcardAlarmWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<WildcardAlarmMetadata>.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                Text(context.attributes.presentation.alert.title).font(.headline)
                AlarmStatus(state: context.state)
                AlarmButtons(state: context.state)
            }.padding().privacySensitive()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) { Text(context.attributes.presentation.alert.title).font(.headline) }
                DynamicIslandExpandedRegion(.bottom) { VStack { AlarmStatus(state: context.state); AlarmButtons(state: context.state) }.privacySensitive() }
            } compactLeading: { Image(systemName: "alarm") }
            compactTrailing: { AlarmStatus(state: context.state).frame(maxWidth: 60) }
            minimal: { Image(systemName: "alarm") }
        }
    }
}
private struct AlarmStatus: View {
    let state: AlarmPresentationState
    var body: some View {
        switch state.mode {
        case .countdown(let countdown):
            if countdown.fireDate > .now { Text(timerInterval: Date.now...countdown.fireDate, countsDown: true).monospacedDigit() }
            else { Text("Time's up") }
        case .paused: Text("Paused")
        case .alert: Text("Alarm")
        @unknown default: Text("Alarm")
        }
    }
}
private struct AlarmButtons: View {
    let state: AlarmPresentationState
    var body: some View {
        HStack {
            switch state.mode {
            case .countdown: Button("Pause", intent: ControlWildcardAlarmIntent(alarmID: state.alarmID, action: "pause"))
            case .paused: Button("Resume", intent: ControlWildcardAlarmIntent(alarmID: state.alarmID, action: "resume"))
            default: EmptyView()
            }
            Button("Cancel", intent: ControlWildcardAlarmIntent(alarmID: state.alarmID, action: "stop"))
        }.buttonStyle(.bordered)
    }
}
