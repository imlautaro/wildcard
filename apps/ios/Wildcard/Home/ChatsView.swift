import SwiftUI

struct ChatsView: View {
    let renameContact: (Contact) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var deletion: Contact?
    @State private var mutationError: String?

    var body: some View {
        List {
            if let error = contacts.error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Retry") { Task { await contacts.refresh(using: auth) } }
                        .disabled(contacts.isLoading || contacts.isMutating)
                }
            }
            if let mutationError {
                Section {
                    Text(mutationError).foregroundStyle(.red)
                    Button("Dismiss") { self.mutationError = nil }
                }
            }
            if !contacts.contacts.isEmpty {
                Section {
                    ForEach(contacts.contacts) { contact in
                        NavigationLink(value: HomeDestination.contact(contact.id)) {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "person.crop.circle")
                                    .font(.system(size: 34))
                                    .foregroundStyle(.secondary)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(contact.name).manrope(.body, weight: .semibold)
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Text(contact.lastMessageText ?? "No messages yet").manrope(.subheadline)
                                        .lineLimit(2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Delete", role: .destructive) { deletion = contact }
                            Button("Rename") { renameContact(contact) }
                                .tint(.accentColor)
                        }
                        .contextMenu {
                            Button("Rename") { renameContact(contact) }
                            Button("Delete", role: .destructive) { deletion = contact }
                        }
                        .disabled(contacts.isMutating)
                    }
                } header: {
                    Text("Contacts").manrope(.footnote, weight: .semibold)
                }
            }
            if contacts.nextCursor != nil {
                Button("Load more") { Task { await contacts.loadMore(using: auth) } }
                    .disabled(contacts.isLoading || contacts.isLoadingMore || contacts.isMutating)
            }
            if contacts.isLoadingMore { ProgressView() }
        }
        .overlay {
            if contacts.contacts.isEmpty && contacts.error == nil && mutationError == nil {
                if !contacts.hasLoaded {
                    ProgressView("Loading contacts…")
                } else {
                    ContentUnavailableView {
                        Label("No contacts yet", systemImage: "person.crop.circle.badge.plus")
                            .manrope(.title2, weight: .semibold)
                    } description: {
                        Text("Tap + to create your first contact.").manrope()
                    }
                }
            }
        }
        .refreshable { await contacts.refresh(using: auth) }
        .task { await contacts.refresh(using: auth, force: false) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await contacts.refresh(using: auth, force: false) } }
        }
        .alert("Delete contact?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } })) {
            Button("Delete", role: .destructive) {
                guard let contact = deletion else { return }
                deletion = nil
                mutationError = nil
                Task {
                    do { try await contacts.delete(contact, using: auth) }
                    catch is CancellationError { }
                    catch { mutationError = error.localizedDescription }
                }
            }
            Button("Cancel", role: .cancel) { deletion = nil }
        } message: {
            Text("This will permanently delete \(deletion?.name ?? "this contact").")
        }
    }
}
