import SwiftUI

struct ChatsView: View {
    enum Mode { case chats, contacts }
    var mode: Mode = .chats
    let openContact: (Contact) -> Void
    let editContact: (Contact) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var deletion: Contact?
    @State private var mutationError: String?

    private var displayedContacts: [Contact] {
        if mode == .chats {
            return contacts.contacts.filter { $0.lastMessageAt != nil || $0.lastMessageText != nil }
        }
        return contacts.contacts.sorted {
            let order = $0.name.localizedStandardCompare($1.name)
            return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
        }
    }

    var body: some View {
        List {
            if mode == .contacts {
                Section {
                    NavigationLink(value: HomeDestination.addContact) {
                        Label("Create contact", systemImage: "person.badge.plus")
                    }
                    NavigationLink(value: HomeDestination.joinContact) {
                        Label("Join Shared Contact", systemImage: "person.2")
                    }
                }
            }
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
            if !displayedContacts.isEmpty {
                Section {
                    ForEach(displayedContacts) { contact in
                        Button {
                            openContact(contact)
                        } label: {
                            if mode == .chats {
                                ChatListRow(contact: contact)
                            } else {
                                HStack(spacing: 12) {
                                    ContactAvatar(contact: contact, size: 48)
                                    Text(contact.name).manrope(.body, weight: .semibold)
                                        .foregroundStyle(.primary)
                                    Spacer(minLength: 0)
                                }
                                .padding(.vertical, 4)
                                .contentShape(Rectangle())
                            }
                        }
                        .buttonStyle(.plain)
                        .listRowSeparator(contact.id == displayedContacts.first?.id ? .hidden : .visible, edges: .top)
                        .listRowSeparator(contact.id == displayedContacts.last?.id ? .hidden : .visible, edges: .bottom)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Delete", role: .destructive) { deletion = contact }
                            if contact.canManage {
                                Button("Edit") { editContact(contact) }.tint(.accentColor)
                            }
                        }
                        .contextMenu {
                            if contact.canManage { Button("Edit") { editContact(contact) } }
                            Button("Delete", role: .destructive) { deletion = contact }
                        }
                        .disabled(contacts.isMutating)
                    }
                }
                .listSectionSeparator(.hidden, edges: .all)
            }
            if contacts.nextCursor != nil && mode == .chats && !displayedContacts.isEmpty {
                Button("Load more") { Task { await contacts.loadMore(using: auth) } }
                    .disabled(contacts.isLoading || contacts.isLoadingMore || contacts.isMutating)
            }
            if contacts.isLoadingMore || (mode == .contacts && !contacts.hasLoaded && contacts.error == nil) {
                ProgressView("Loading contacts…")
            }
            if mode == .contacts && contacts.hasLoaded && contacts.nextCursor == nil && displayedContacts.isEmpty && contacts.error == nil {
                Text("No contacts yet").manrope().foregroundStyle(.secondary)
            }
        }
        .listStyle(.plain)
        .overlay {
            if mode == .chats && displayedContacts.isEmpty && contacts.error == nil && mutationError == nil {
                if !contacts.hasLoaded || contacts.nextCursor != nil {
                    ProgressView("Loading contacts…")
                } else {
                    ContentUnavailableView {
                        Label("No chats yet", systemImage: "bubble.left.and.bubble.right")
                            .manrope(.title2, weight: .semibold)
                    } description: {
                        Text("Tap + to choose a contact and start a conversation.").manrope()
                    }
                }
            }
        }
        .refreshable { await contacts.refresh(using: auth) }
        .task { await contacts.refresh(using: auth, force: false) }
        .task(id: "\(contacts.nextCursor ?? "")-\(contacts.isLoading)-\(contacts.isMutating)") {
            // Load the complete directory, or skip empty pages until Chats has rows.
            while !Task.isCancelled, contacts.error == nil,
                  !contacts.isLoading, !contacts.isLoadingMore, !contacts.isMutating,
                  let cursor = contacts.nextCursor,
                  mode == .contacts || displayedContacts.isEmpty {
                await contacts.loadMore(using: auth)
                guard contacts.nextCursor != cursor else { break }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await contacts.refresh(using: auth) } }
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
            if deletion?.canManage == false {
                Text("This removes your access and deletes your private chat, schedules, and contributed memories. Other participants keep the contact.")
            } else {
                Text("This permanently deletes \(deletion?.name ?? "this contact") for everyone, including all participants' chats, schedules, and memories.")
            }
        }
    }
}

private struct ChatListRow: View {
    let contact: Contact
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts

    private var messagePreview: String {
        guard let text = contact.lastMessageText else { return "No messages yet" }
        return text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func lastMessageTime(_ timestamp: Double, relativeTo now: Date) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date),
                                           to: calendar.startOfDay(for: now)).day ?? 0
        if days == 0 { return date.formatted(.dateTime.hour().minute()) }
        if days == 1 { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = (2...6).contains(days) ? "EEEE" : "dd/MM/yyyy"
        return formatter.string(from: date)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ContactAvatar(contact: contact, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(contact.name).manrope(.body, weight: .semibold)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(messagePreview).manrope(.subheadline)
                    .lineLimit(2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                if let timestamp = contacts.lastMessageTimestamp(for: contact) {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        Text(lastMessageTime(timestamp, relativeTo: context.date))
                            .manrope(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                if let count = contact.unreadCount, count > 0 {
                    Text(count > 99 ? "99+" : String(count))
                        .manrope(.caption, weight: .bold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.accentColor, in: Capsule())
                        .accessibilityLabel("\(count) unread replies")
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .task(id: contact.lastMessageText) {
            await contacts.loadMessageTimestamp(for: contact, using: auth)
        }
    }
}
