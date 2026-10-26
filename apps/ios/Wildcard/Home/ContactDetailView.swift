import SwiftUI

struct ContactDetailView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var loading = true
    @State private var error: String?

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
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink(value: HomeDestination.editContact(contactID)) {
                        HStack(spacing: 8) {
                            ContactAvatar(contact: contact, size: 30)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(contact.name).manrope(.headline, weight: .semibold)
                                    .foregroundStyle(Color(uiColor: .label))
                                Text(contacts.conversations.store(for: contactID).presence?.label ?? " ")
                                    .manrope(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .tint(Color(uiColor: .label))
                    .accessibilityLabel("Edit \(contact.name)")
                    .accessibilityValue(contacts.conversations.store(for: contactID).presence?.label ?? "")
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
