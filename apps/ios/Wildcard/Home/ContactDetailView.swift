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
                ContentUnavailableView {
                    Label("No messages yet", systemImage: "bubble.left.and.bubble.right")
                        .manrope(.title2, weight: .semibold)
                } description: {
                    Text(contact.name).manrope()
                }
            } else if loading {
                ProgressView("Loading contact…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView("Contact not found", systemImage: "person.crop.circle.badge.questionmark")
            }
        }
        .navigationTitle(contacts.contact(id: contactID)?.name ?? "Contact")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let contact = contacts.contact(id: contactID) {
                ToolbarItem(placement: .principal) {
                    NavigationLink(value: HomeDestination.renameContact(contactID)) {
                        Text(contact.name).manrope(.headline, weight: .semibold)
                    }
                    .accessibilityLabel("Rename \(contact.name)")
                }
            }
        }
        .task(id: contactID) { await refresh() }
    }

    private func refresh() async {
        loading = true
        error = nil
        defer { loading = false }
        do { try await contacts.refreshContact(id: contactID, using: auth) }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
