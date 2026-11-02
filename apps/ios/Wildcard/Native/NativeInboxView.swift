import SwiftUI

struct NativeExperimentsDirectoryView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(NativeExperiments.self) private var native
    private static let capabilities: [(kind: String, symbol: String?, title: String)] = [
        ("timer", nil, String(localized: "Timers and alarms")),
        ("calendar", nil, String(localized: "Calendar and Reminders")),
        ("default", "square.and.arrow.up", String(localized: "Shortcuts, widgets and sharing")),
    ]
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Try native iOS tools with individual contacts. Enable each contact on this device, then request an action in its private chat.")
                        .manrope(.subheadline)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Self.capabilities, id: \.title) { item in
                            Label { Text(item.title).manrope(.footnote).foregroundStyle(.secondary) } icon: {
                                NativeGlyph(kind: item.kind, size: 22, symbol: item.symbol)
                            }
                        }
                    }
                }.padding(.vertical, 4)
            }
            Section("Contacts") {
                ForEach(contacts.nativeDirectoryContacts.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }) { contact in
                    let count = (native.enabled[contact.id] ?? []).count
                    NavigationLink(value: HomeDestination.nativeTools(contact.id)) {
                        HStack(spacing: 12) {
                            ContactAvatar(contact: contact, size: 36)
                            Text(contact.name).lineLimit(1)
                            Spacer(minLength: 8)
                            if count > 0 {
                                Text("Enabled").manrope(.caption, weight: .semibold).foregroundStyle(.green)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(.green.opacity(0.14), in: Capsule())
                            } else {
                                Text("Off").manrope(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if !native.localAlarms.isEmpty {
                Section("Scheduled Wildcard alarms") {
                    ForEach(native.localAlarms) { alarm in
                        NativeAlarmRow(alarm: alarm)
                    }
                }
            }
            if let error = native.error {
                Label { Text(error) } icon: { Image(systemName: "exclamationmark.triangle.fill") }.foregroundStyle(.red)
            }
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
            if native.drafts.isEmpty {
                ContentUnavailableView("No shared drafts", systemImage: "tray",
                    description: Text("Items you share to a Wildcard contact appear here until you send or discard them."))
            }
            ForEach(native.drafts) { draft in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        ContactAvatar(contact: contacts.contact(id: draft.contactID), size: 32)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(contacts.contact(id: draft.contactID)?.name ?? String(localized: "Contact")).manrope(.headline, weight: .semibold)
                            Text(draft.createdAt, format: .relative(presentation: .named)).manrope(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Text(draft.text.isEmpty ? String(localized: "Shared attachment") : draft.text).manrope(.subheadline).lineLimit(6)
                        .foregroundStyle(draft.text.isEmpty ? .secondary : .primary)
                    if let file = draft.filename {
                        Label(file, systemImage: "doc.fill").manrope(.footnote, weight: .medium).lineLimit(1)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    HStack {
                        Button("Review in chat") {
                            native.selectedDraft = draft
                            native.route = .init(contactID: draft.contactID, agentID: nil, draftID: draft.id)
                            dismiss()
                        }.buttonStyle(.borderedProminent)
                        Button("Discard", role: .destructive) { native.consumeDraft(draft.id) }.buttonStyle(.bordered)
                    }.buttonBorderShape(.capsule).manrope(.subheadline, weight: .semibold)
                }.padding(.vertical, 4)
            }
        }
        .navigationTitle("Shared drafts")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .task { native.reloadDrafts() }
    }
}
