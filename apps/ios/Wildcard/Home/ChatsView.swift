import SwiftUI

struct ChatsView: View {
    enum Mode { case chats, contacts, archived }
    var mode: Mode = .chats
    let openContact: (Contact) -> Void
    let editContact: (Contact) -> Void
    let openGroup: (ChatGroup) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(GroupsStore.self) private var groups
    @Environment(ContactInvitationsStore.self) private var invitations
    @Environment(\.scenePhase) private var scenePhase
    @State private var clearContact: Contact?
    @State private var clearGroup: ChatGroup?
    @State private var lifecycleBusy = false
    @State private var deletion: Contact?
    @State private var mutationError: String?

    private var isWaitingForChatLists: Bool {
        (!contacts.hasLoaded || !groups.hasLoaded) && contacts.error == nil && groups.error == nil
    }

    private var displayedContacts: [Contact] {
        if mode != .contacts {
            return contacts.contacts.map { contacts.preview(for: $0) }.filter {
                ($0.archivedAt != nil) == (mode == .archived) && ($0.lastMessageAt != nil || $0.lastMessageText != nil || $0.onboardingChat == 1 || $0.clearing == 1 || mode == .archived
                    // A draft keeps a chat without messages in the list.
                    || ChatListPreview.draft(contacts.conversations.cachedStore(for: $0.id)?.draft) != nil)
            }
        }
        return contacts.contacts.sorted {
            let order = $0.name.localizedStandardCompare($1.name)
            return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
        }
    }

    private var chatEntries: [ChatListEntry] {
        // Publish the initial mixed list only after both sources have loaded.
        // On failure, keep the available rows accessible alongside retry controls.
        guard !isWaitingForChatLists else { return [] }
        var entries = displayedContacts.map(ChatListEntry.contact)
        // Defer older groups until private-chat pagination reaches their timestamp.
        // This avoids putting them ahead of newer private chats on unloaded pages.
        let boundary = contacts.nextCursor?.split(separator: ":", maxSplits: 1).first.flatMap { Double($0) }
        entries += groups.groups.map { groups.preview(for: $0) }.filter { group in
            (group.archivedAt != nil) == (mode == .archived) && (boundary.map { (group.lastMessageAt ?? group.updatedAt) >= $0 } ?? true)
        }.map(ChatListEntry.group)
        return entries.sorted {
            let first = $0.timestamp(using: contacts)
            let second = $1.timestamp(using: contacts)
            return first == second ? $0.id > $1.id : first > second
        }
    }

    // Progressive first circle (docs/onboarding.md#progressive-setup).
    private var creatingCircle: Bool { mode == .chats && auth.onboarding.running }
    private var circleFailed: Bool { mode == .chats && auth.onboarding.snapshot?.status == "failed" }
    /// Before the identities exist, placeholders stand in for the five contacts.
    private var circlePlaceholders: Int {
        creatingCircle && !contacts.contacts.contains(where: \.isSettingUp) && (auth.onboarding.snapshot?.photoCount ?? 0) == 0 ? 5 : 0
    }

    private func pendingRow(name: String, contact: Contact?) -> some View {
        HStack(alignment: .center, spacing: 12) {
            if let contact { ContactAvatar(contact: contact, size: mode == .contacts ? 48 : 48) }
            else { Circle().fill(Color(uiColor: .secondarySystemFill)).frame(width: 48, height: 48) }
            VStack(alignment: .leading, spacing: 4) {
                Text(name).manrope(.body, weight: .semibold).lineLimit(1)
                HStack(spacing: 6) {
                    ProgressView().controlSize(.mini)
                    Text("Creating…").manrope(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .opacity(0.55)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), being created")
    }

    @ViewBuilder private func contactRow(_ contact: Contact) -> some View {
        if contact.isSettingUp { pendingRow(name: contact.name, contact: contact) }
        else { contactButton(contact) }
    }

    private func contactButton(_ contact: Contact) -> some View {
        Button { openContact(contact) } label: {
            if mode != .contacts {
                ChatListRow(contact: contact)
            } else {
                HStack(spacing: 12) {
                    ContactAvatar(contact: contact, size: 48)
                    Text(contact.name).manrope(.body, weight: .semibold).foregroundStyle(.primary)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 4).contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
        // Only conflicting mutations wait; rows stay openable while a change finishes.
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button("Delete", role: .destructive) { deletion = contact }.disabled(contacts.isMutating)
            if mode != .contacts {
                Button(contact.archivedAt == nil ? "Archive" : "Unarchive") { archive(contact) }.tint(.indigo)
                Button("Clear chat", role: .destructive) { clearContact = contact }
            }
            if contact.canManage { Button("Edit") { editContact(contact) }.tint(.accentColor) }
        }
        .contextMenu {
            Button(contact.archivedAt == nil ? "Archive" : "Unarchive") { archive(contact) }
            Button("Clear chat", role: .destructive) { clearContact = contact }
            if contact.canManage { Button("Edit") { editContact(contact) } }
            Button("Delete", role: .destructive) { deletion = contact }.disabled(contacts.isMutating)
        }
    }

    var body: some View {
        let entries = chatEntries
        List {
            if mode != .contacts {
                if let error = groups.error {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                    Button("Refresh groups") { Task { await groups.refresh(using: auth) } }
                }
            }
            if mode == .contacts {
                Section {
                    NavigationLink(value: HomeDestination.createGroup) {
                        Label("Create group", systemImage: "person.3")
                    }
                    NavigationLink(value: HomeDestination.groupInvitations) {
                        HStack {
                            Label("Group Invitations", systemImage: groups.invitations.isEmpty ? "envelope" : "envelope.badge")
                            Spacer()
                            if !groups.invitations.isEmpty {
                                Text(String(groups.invitations.count)).manrope(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    NavigationLink(value: HomeDestination.contactInvitations) {
                        HStack {
                            Label("Contact Invitations", systemImage: invitations.invitations.isEmpty ? "envelope" : "envelope.badge")
                            Spacer()
                            if !invitations.invitations.isEmpty {
                                Text(String(invitations.invitations.count)).manrope(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
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
                        .disabled(contacts.isMutating)
                }
            }
            if let mutationError {
                Section {
                    Text(mutationError).foregroundStyle(.red)
                    Button("Dismiss") { self.mutationError = nil }
                }
            }
            if creatingCircle {
                Section {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Creating your contacts… \(auth.onboarding.snapshot?.photoCount ?? 0) of 5 ready. Each one opens as soon as it is ready.")
                            .manrope(.footnote).foregroundStyle(.secondary)
                    }
                    ForEach(0..<circlePlaceholders, id: \.self) { _ in pendingRow(name: "New contact", contact: nil) }
                }
                .listSectionSeparator(.hidden, edges: .all)
            } else if circleFailed {
                Section {
                    Text("We could not finish creating your contacts.").manrope(.footnote)
                    Button("Retry") { Task { await auth.onboarding.retry(auth: auth) } }
                        .disabled(auth.onboarding.busy)
                }
            }
            if mode == .chats && entries.isEmpty && !creatingCircle && contacts.hasLoaded && groups.hasLoaded && contacts.nextCursor == nil {
                Section { Text("No chats yet. Tap + to choose a contact.").foregroundStyle(.secondary) }
            }
            if mode != .contacts && !entries.isEmpty {
                Section {
                    ForEach(entries) { entry in
                        Group {
                            switch entry {
                            case .contact(let contact):
                                contactRow(contact)
                            case .group(let group):
                                Button { openGroup(group) } label: { GroupChatListRow(group: group) }
                                    .buttonStyle(.plain)
                                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                        Button(group.archivedAt == nil ? "Archive" : "Unarchive") { archive(group) }.tint(.indigo)
                                        if group.ownerID == auth.user?.id { Button("Clear chat", role: .destructive) { clearGroup = group } }
                                    }
                                    .contextMenu {
                                        Button(group.archivedAt == nil ? "Archive" : "Unarchive") { archive(group) }
                                        if group.ownerID == auth.user?.id { Button("Clear chat", role: .destructive) { clearGroup = group } }
                                    }
                            }
                        }
                        .listRowSeparator(entry.id == entries.first?.id ? .hidden : .visible, edges: .top)
                        .listRowSeparator(entry.id == entries.last?.id ? .hidden : .visible, edges: .bottom)
                    }
                }
                .listSectionSeparator(.hidden, edges: .all)
            }
            if mode == .contacts && !displayedContacts.isEmpty {
                Section {
                    ForEach(displayedContacts) { contact in
                        contactRow(contact)
                            .listRowSeparator(contact.id == displayedContacts.first?.id ? .hidden : .visible, edges: .top)
                            .listRowSeparator(contact.id == displayedContacts.last?.id ? .hidden : .visible, edges: .bottom)
                    }
                }
                .listSectionSeparator(.hidden, edges: .all)
            }
            if contacts.nextCursor != nil && mode != .contacts && !entries.isEmpty {
                Button("Load more") { Task { await contacts.loadMore(using: auth) } }
                    .disabled(contacts.isLoadingMore || contacts.isMutating)
            }
            if contacts.isLoadingMore || (mode == .contacts && !contacts.hasLoaded && contacts.error == nil) {
                ProgressView("Loading contacts…")
            }
            if mode == .contacts && contacts.hasLoaded && contacts.nextCursor == nil && displayedContacts.isEmpty && contacts.error == nil {
                Text("No contacts yet").manrope().foregroundStyle(.secondary)
            }
        }
        .listStyle(.plain)
        .task(id: creatingCircle) {
            guard mode == .chats else { return }
            if auth.onboarding.snapshot == nil || creatingCircle { await auth.onboarding.refreshStatus(auth: auth) }
            // The contact list itself is revalidated by ConversationSync; this follows the circle's progress.
            while creatingCircle && !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                await auth.onboarding.refreshStatus(auth: auth)
            }
        }
        .overlay {
            if mode != .contacts && entries.isEmpty && groups.error == nil && contacts.error == nil && mutationError == nil {
                if !contacts.hasLoaded || !groups.hasLoaded || contacts.nextCursor != nil {
                    ProgressView("Loading chats…")
                } else if mode == .archived {
                    ContentUnavailableView {
                        Label(mode == .archived ? "No archived chats" : "No chats yet", systemImage: "bubble.left.and.bubble.right")
                            .manrope(.title2, weight: .semibold)
                    } description: {
                        Text("Tap + to choose a contact and start a conversation.").manrope()
                    }
                }
            }
        }
        .refreshable {
            async let contactRefresh: Void = contacts.refresh(using: auth)
            async let groupRefresh: Void = groups.refresh(using: auth)
            _ = await (contactRefresh, groupRefresh)
            if mode == .contacts { await invitations.refresh(using: auth, force: true) }
        }
        .task {
            await contacts.refresh(using: auth, force: false)
        }
        .task {
            if mode != .contacts { await groups.refresh(using: auth) }
        }
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
        .disabled(lifecycleBusy)
        .confirmationDialog("Clear private chat?", isPresented: Binding(get: { clearContact != nil }, set: { if !$0 { clearContact = nil } }), titleVisibility: .visible) {
            if let contact = clearContact {
                Button("Clear chat, keep memory", role: .destructive) { clear(contact, memory: false) }
                Button("Clear chat and memory", role: .destructive) { clear(contact, memory: true) }
                Button("Delete contact and data", role: .destructive) { deletion = contact; clearContact = nil }
            }
            Button("Cancel", role: .cancel) { clearContact = nil }
        } message: {
            Text("Permanently remove messages, files, tasks, documents, mini apps, and scheduled work from your private conversation. Keep the extracted memories or delete memory learned here too. Other people's chats are unaffected.")
        }
        .confirmationDialog("Clear group for everyone?", isPresented: Binding(get: { clearGroup != nil }, set: { if !$0 { clearGroup = nil } }), titleVisibility: .visible) {
            if let group = clearGroup {
                Button("Clear chat, keep memory", role: .destructive) { clear(group, memory: false) }
                Button("Clear chat and memory", role: .destructive) { clear(group, memory: true) }
            }
            Button("Cancel", role: .cancel) { clearGroup = nil }
        } message: {
            Text("Permanently remove the shared messages, files, tasks, documents, mini apps, and pending work for every group member. Keep the extracted memories or delete memory learned here too.")
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
                Text("This permanently deletes \(deletion?.name ?? "this contact") for everyone, including all participants' chats, schedules, memories, and this contact's group messages and work.")
            }
        }
    }
    private func perform(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !lifecycleBusy else { return }
        lifecycleBusy = true
        mutationError = nil
        Task {
            defer { lifecycleBusy = false }
            do { try await operation() }
            catch is CancellationError { }
            catch { mutationError = error.localizedDescription }
        }
    }
    private func archive(_ contact: Contact) {
        perform { try await contacts.archive(contact, archived: contact.archivedAt == nil, using: auth) }
    }
    private func archive(_ group: ChatGroup) {
        perform { try await groups.archive(group, archived: group.archivedAt == nil, using: auth) }
    }
    private func clear(_ contact: Contact, memory: Bool) {
        clearContact = nil
        perform { try await contacts.clear(contact, clearMemory: memory, using: auth) }
    }
    private func clear(_ group: ChatGroup, memory: Bool) {
        clearGroup = nil
        perform { try await groups.clear(group, clearMemory: memory, using: auth) }
    }

}

private struct ChatListRow: View {
    let contact: Contact
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts

    private var activity: String? {
        contact.replyActivity == "researching" ? "Researching..."
            : contact.replyActivity == "recording" ? "Recording..." : contact.replyActivity == "typing" ? "Typing..." : nil
    }
    private var draft: String? {
        contact.clearing == 1 || activity != nil ? nil : ChatListPreview.draft(contacts.conversations.cachedStore(for: contact.id)?.draft)
    }
    private var reaction: (sender: String?, text: String)? {
        guard contact.clearing != 1, activity == nil, draft == nil,
              contacts.conversations.cachedStore(for: contact.id)?.outgoingMessage == nil else { return nil }
        return ChatListPreview.reaction(contact.lastReaction, after: contact.lastMessageAt, group: false)
    }
    /// The second line: live activity, then a draft, then a newer reaction, then the last message.
    private var preview: AttributedString {
        if let draft { return ChatListPreview.labeled("Draft", draft, size: previewSize, accent: true) }
        if let reaction { return reaction.sender.map { ChatListPreview.labeled($0, reaction.text, size: previewSize) } ?? AttributedString(reaction.text) }
        return AttributedString(messagePreview)
    }
    /// Receipts and the microphone belong to the last message only.
    private var showsMessage: Bool { activity == nil && draft == nil && reaction == nil }
    @ScaledMetric(relativeTo: .subheadline) private var previewSize: CGFloat = 15
    private var messagePreview: String {
        if contact.clearing == 1 { return "Cleaning up..." }
        if let activity { return activity }
        if let voice = contact.lastMessageVoice { return "Voice message (\(VoiceDuration.format(milliseconds: voice.durationMs)))" }
        guard let text = contact.lastMessageText else { return "No messages yet" }
        return (contact.lastMessagePreview ?? (contact.lastMessageFromUser == 0 ? MessageMarkdown.plainText(text) : text)).components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ContactAvatar(contact: contact, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(contact.name).manrope(.body, weight: .semibold)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if showsMessage && contact.lastMessageFromUser == 1 {
                        MessageReceiptView(sentAt: contact.lastMessageAt ?? contact.createdAt, readAt: contact.lastMessageReadAt, isSending: contacts.conversations.cachedStore(for: contact.id)?.outgoingMessage != nil)
                    }
                    if showsMessage && contact.clearing != 1, let voice = contact.lastMessageVoice {
                        VoicePreviewMicrophone(listened: contact.lastMessageFromUser == 1 ? voice.listenedAt != nil : voice.ownListenedAt != nil)
                    }
                    Text(preview).manrope(.subheadline)
                        .lineLimit(2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                if let timestamp = contacts.lastMessageTimestamp(for: contact) {
                    ChatListTimestamp(timestamp: timestamp)
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

private enum ChatListEntry: Identifiable {
    case contact(Contact)
    case group(ChatGroup)

    var id: String {
        switch self {
        case .contact(let contact): "contact/\(contact.id)"
        case .group(let group): "group/\(group.id)"
        }
    }
    func timestamp(using contacts: ContactsStore) -> Double {
        switch self {
        case .contact(let contact): contacts.lastMessageTimestamp(for: contact) ?? contact.createdAt
        case .group(let group): group.lastMessageAt ?? group.updatedAt
        }
    }
}

private struct GroupChatListRow: View {
    let group: ChatGroup
    @Environment(GroupsStore.self) private var groups
    @Environment(AuthStore.self) private var auth
    private var own: Bool { group.lastMessageUserID == auth.user?.id && group.lastMessageUserID != nil }
    @ScaledMetric(relativeTo: .subheadline) private var previewSize: CGFloat = 15

    private var draft: String? {
        group.clearing == 1 || group.replyActivity != nil ? nil : ChatListPreview.draft(groups.conversations.cachedStore(for: group.id)?.draft)
    }
    private var sending: Bool {
        groups.conversations.cachedStore(for: group.id).map { $0.pendingID == group.lastMessageID && !$0.pendingAccepted } ?? false
    }
    private var reaction: (sender: String?, text: String)? {
        guard group.clearing != 1, group.replyActivity == nil, draft == nil, !sending else { return nil }
        return ChatListPreview.reaction(group.lastReaction, after: group.lastMessageAt, group: true)
    }
    /// Receipts and the microphone belong to the last message only.
    private var showsMessage: Bool { group.replyActivity == nil && draft == nil && reaction == nil }

    /// The second line: live activity, then a draft, then a newer reaction, then the last message.
    private var messagePreview: AttributedString {
        if group.clearing == 1 { return AttributedString("Cleaning up...") }
        if let activity = group.replyActivity { return AttributedString(activity) }
        if let draft { return ChatListPreview.labeled("Draft", draft, size: previewSize, accent: true) }
        if let reaction { return reaction.sender.map { ChatListPreview.labeled($0, reaction.text, size: previewSize) } ?? AttributedString(reaction.text) }
        let source = group.lastMessageText
        let cleaned = group.lastMessagePreview ?? source.map { group.lastMessageUserID == nil ? MessageMarkdown.plainText($0) : $0 }
        let voiceLabel = group.lastMessageVoice.map { "Voice message (\(VoiceDuration.format(milliseconds: $0.durationMs)))" }
        let message = (voiceLabel ?? cleaned)?.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ") ?? "No messages yet"
        guard let sender = own ? "You" : group.lastMessageSenderName, !sender.isEmpty else { return AttributedString(message) }
        var preview = AttributedString(sender + ": ")
        preview.font = Font(AppTypography.font(size: previewSize, weight: .bold))
        preview += AttributedString(message)
        return preview
    }
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            GroupPhotoAvatar(group: group, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(group.name).manrope(.body, weight: .semibold).foregroundStyle(.primary).lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if own && showsMessage {
                        MessageReceiptView(sentAt: group.lastMessageAt ?? group.createdAt,
                            isSending: sending,
                            receiptState: group.lastMessageReceiptState ?? "sent")
                    }
                    if showsMessage && group.clearing != 1, let voice = group.lastMessageVoice {
                        VoicePreviewMicrophone(listened: own ? voice.listenedAt != nil : voice.ownListenedAt != nil)
                    }
                    Text(messagePreview).manrope(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                if let timestamp = group.lastMessageAt ?? (group.lastMessageText == nil ? nil : group.updatedAt) {
                    ChatListTimestamp(timestamp: timestamp)
                }
                if let count = group.unreadCount, count > 0 {
                    Text(count > 99 ? "99+" : String(count))
                        .manrope(.caption, weight: .bold).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.accentColor, in: Capsule())
                        .accessibilityLabel("\(count) unread messages")
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// Chat list second-line labels shared by private and group rows (docs/chats.md#chat-list-previews).
private enum ChatListPreview {
    /// The unsent composer text on one line, or nil when there is nothing to show.
    static func draft(_ text: String?) -> String? {
        let value = (text ?? "").split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return value.isEmpty ? nil : String(value.prefix(500))
    }
    /// "You: reacted with 👍" / "Reacted with 👍" (private) / "Ana: reacted with 👍" (group), when the
    /// reaction is newer than the last message.
    static func reaction(_ reaction: LastReaction?, after lastMessageAt: Double?, group: Bool) -> (sender: String?, text: String)? {
        guard let reaction, reaction.at > (lastMessageAt ?? 0) else { return nil }
        let sender = reaction.own ? "You" : group ? reaction.name.flatMap { $0.isEmpty ? nil : $0 } : nil
        return (sender, "\(sender == nil ? "Reacted" : "reacted") with \(reaction.emoji)")
    }
    static func labeled(_ label: String, _ text: String, size: CGFloat, accent: Bool = false) -> AttributedString {
        var prefix = AttributedString(label + ": ")
        prefix.font = Font(AppTypography.font(size: size, weight: .bold))
        if accent { prefix.foregroundColor = .accentColor }
        return prefix + AttributedString(text)
    }
}

private struct ChatListTimestamp: View {
    let timestamp: Double

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            Text(lastMessageTime(timestamp, relativeTo: context.date))
                .manrope(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
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

}

private struct VoicePreviewMicrophone: View {
    let listened: Bool
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        Image(systemName: "mic.fill")
            .font(.subheadline)
            .foregroundStyle(listened ? MessageReceiptView.readColor(colorScheme) : Color.secondary)
            .accessibilityLabel(listened ? "Listened" : "Not listened yet")
    }
}
