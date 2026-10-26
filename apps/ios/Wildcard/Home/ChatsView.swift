import SwiftUI

struct ChatsView: View {
    let openContact: (Contact) -> Void
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
                        Button {
                            openContact(contact)
                        } label: {
                            ChatListRow(contact: contact)
                        }
                        .buttonStyle(.plain)
                        .listRowSeparator(contact.id == contacts.contacts.first?.id ? .hidden : .visible, edges: .top)
                        .listRowSeparator(contact.id == contacts.contacts.last?.id ? .hidden : .visible, edges: .bottom)
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
                }
                .listSectionSeparator(.hidden, edges: .all)
            }
            if contacts.nextCursor != nil {
                Button("Load more") { Task { await contacts.loadMore(using: auth) } }
                    .disabled(contacts.isLoading || contacts.isLoadingMore || contacts.isMutating)
            }
            if contacts.isLoadingMore { ProgressView() }
        }
        .listStyle(.plain)
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
            Text("This will permanently delete \(deletion?.name ?? "this contact").")
        }
    }
}

private struct ChatListRow: View {
    let contact: Contact
    @Environment(AuthStore.self) private var auth
    @State private var legacyMessageAt: Double?

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
            Image(systemName: "person.crop.circle")
                .font(.system(size: 34))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
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
                if let timestamp = contact.lastMessageAt ?? legacyMessageAt {
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
            legacyMessageAt = nil
            guard contact.lastMessageAt == nil, contact.lastMessageText != nil else { return }
            do {
                let page = try await auth.withSession { api, token in
                    try await api.chatTurns(contactID: contact.id, token: token)
                }
                guard !Task.isCancelled, let turn = page.turns.last else { return }
                legacyMessageAt = turn.assistantText == nil ? turn.createdAt : turn.updatedAt
            } catch {
                // Keep the row usable if an older API cannot provide the timestamp.
            }
        }
    }
}
