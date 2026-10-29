import SwiftUI

struct ContactDetailView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var loading = true
    @State private var error: String?
    /// A task work turn has no human message; say what the contact is working on instead of its presence.
    private var statusLabel: String {
        let chat = contacts.conversations.store(for: contactID)
        if let turn = chat.turns.first(where: { $0.taskID != nil && ($0.status == .queued || $0.status == .running) }) {
            return turn.taskTitle.map { "Working on “\($0)”…" } ?? "Working on a task…"
        }
        return chat.presence?.label ?? "Loading..."
    }

    var body: some View {
        VStack {
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
                    .padding(.horizontal)
                Button("Retry") { Task { await refresh() } }
                    .disabled(loading)
            }
            if let contact = contacts.contact(id: contactID) {
                ChatView(contactID: contact.id, chat: contacts.conversations.store(for: contact.id)).id(contact.id)
            } else if loading {
                ProgressView("Loading contact…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView("Contact not found", systemImage: "person.crop.circle.badge.questionmark")
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let contact = contacts.contact(id: contactID) {
                if contact.canManage {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: HomeDestination.sharing(contactID)) {
                            Image(systemName: "person.badge.plus")
                        }
                        .tint(Color(uiColor: .label))
                        .accessibilityLabel("Share contact")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        TasksView(base: "contacts/\(contactID)", snapshot: contacts.taskSnapshots.store(for: "contacts/\(contactID)"))
                    } label: {
                        Image(systemName: "checklist")
                    }
                    .tint(Color(uiColor: .label))
                    .accessibilityLabel("Tasks")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: HomeDestination.schedules(contactID)) {
                        Image(systemName: "clock")
                    }
                    .tint(Color(uiColor: .label))
                    .accessibilityLabel("Schedules")
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink(value: HomeDestination.editContact(contactID)) {
                        HStack(spacing: 6) {
                            ContactAvatar(contact: contact, size: 38)
                            VStack(alignment: .leading, spacing: -2) {
                                Text(contact.name).manrope(.headline, weight: .semibold)
                                    .foregroundStyle(Color(uiColor: .label))
                                Text(statusLabel)
                                    .manrope(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.leading, -6)
                        .padding(.trailing, 8)
                    }
                    .tint(Color(uiColor: .label))
                    .accessibilityLabel(contact.canManage ? "Edit \(contact.name)" : "View \(contact.name)")
                    .accessibilityValue(statusLabel)
                }
            }
        }
        .task(id: contactID) { await refresh(force: false) }
    }

    private func refresh(force: Bool = true) async {
        loading = true
        error = nil
        defer { loading = false }
        do { try await contacts.refreshContact(id: contactID, using: auth, force: force) }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
