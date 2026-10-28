import SwiftUI

struct NativeExperimentsDirectoryView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native
    var body: some View {
        List {
            Section {
                Text("Try native iOS tools with individual contacts. Enable each contact on this device, then request an action in its private chat.")
                Text("Supports Live Activities, timers and alarms, Calendar, Reminders, spoken text, Shortcuts, widgets, sharing and NFC links.").foregroundStyle(.secondary)
            }
            Section("Contacts") {
                ForEach(contacts.nativeDirectoryContacts.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }) { contact in
                    NavigationLink(value: HomeDestination.nativeTools(contact.id)) {
                        LabeledContent(contact.name, value: (native.enabled[contact.id] ?? []).isEmpty ? "Off" : "Enabled")
                    }
                }
            }
            if !native.localAlarms.isEmpty {
                Section("Scheduled Wildcard alarms") {
                    ForEach(native.localAlarms) { alarm in
                        LabeledContent(alarm.title) {
                            Button("Cancel alarm", role: .destructive) { native.cancelLocalAlarm(alarm) }
                                .disabled(!native.busy.isEmpty)
                        }
                    }
                }
            }
            if let error = native.error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("Native experiments")
            .task {
                native.refreshLocalAlarms()
                await contacts.refresh(using: auth, force: false, preserveLoadedPages: true)
                var pages = 0
                while contacts.nextCursor != nil, contacts.error == nil, !Task.isCancelled, pages < 40 {
                    await contacts.loadMore(using: auth); pages += 1
                }
            }
            .refreshable { native.refreshLocalAlarms(); await contacts.refresh(using: auth, preserveLoadedPages: true) }
    }
}
struct NativeInboxView: View {
    @Environment(NativeExperiments.self) private var native
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        List {
            if native.drafts.isEmpty { Text("No shared drafts.").foregroundStyle(.secondary) }
            ForEach(native.drafts) { draft in
                VStack(alignment: .leading, spacing: 8) {
                    Text(contacts.contact(id: draft.contactID)?.name ?? "Contact").font(.headline)
                    Text(draft.text.isEmpty ? "Shared attachment" : draft.text).lineLimit(6)
                    if let file = draft.filename { Label(file, systemImage: "doc") }
                    HStack {
                        Button("Review in chat") {
                            native.selectedDraft = draft
                            native.route = .init(contactID: draft.contactID, agentID: nil, draftID: draft.id)
                            dismiss()
                        }
                        Button("Discard", role: .destructive) { native.consumeDraft(draft.id) }
                    }.buttonStyle(.bordered)
                }
            }
        }
        .navigationTitle("Shared drafts")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .task { native.reloadDrafts() }
    }
}
