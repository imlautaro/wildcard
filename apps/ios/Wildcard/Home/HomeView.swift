import SwiftUI

enum HomeDestination: Hashable {
    case contacts
    case createGroup
    case group(String)
    case groupDetails(String)
    case groupInviteUser(String)
    case groupAddContact(String)
    case groupContactConsent(String, String)
    case groupInvitations
    case addContact
    case contact(String)
    case editContact(String)
    case schedules(String)
    case sharing(String)
    case joinContact
    case contactInvitations
    case receivedInvitation(ReceivedContactInvitation)
}

struct HomeView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(PushNotifications.self) private var push
    @Environment(\.scenePhase) private var scenePhase
    private enum Section: Hashable {
        case chats
        case account

        var title: String { self == .chats ? "Chats" : "Account" }
    }

    @State private var section: Section = .chats
    @State private var destinations: [HomeDestination] = []
    @State private var contacts = ContactsStore()
    @State private var groups = GroupsStore()
    @State private var invitations = ContactInvitationsStore()

    private var totalUnreadCount: Int { contacts.totalUnreadCount + groups.totalUnreadCount }

    var body: some View {
        NavigationStack(path: $destinations) {
            TabView(selection: $section) {
                Tab("Chats", systemImage: "bubble.left.and.bubble.right", value: Section.chats) {
                    ChatsView(
                        openContact: { contact in destinations.append(.contact(contact.id)) },
                        editContact: { contact in destinations.append(.editContact(contact.id)) },
                        openGroup: { group in destinations.append(.group(group.id)) }
                    )
                }
                .badge(totalUnreadCount)
                Tab("Account", systemImage: "person.crop.circle", value: Section.account) {
                    AccountView()
                }
            }
            .navigationTitle(section.title)
            .toolbar {
                if section == .chats && destinations.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: HomeDestination.contacts) {
                            Image(systemName: "plus")
                        }
                        .tint(Color(uiColor: .label))
                        .accessibilityLabel("Open Contacts")
                        .disabled(contacts.isMutating)
                    }
                }
            }
            // Destinations replace the complete tab layout, sharing one back stack.
            .navigationDestination(for: HomeDestination.self) { destination in
                switch destination {
                case .createGroup:
                    CreateGroupView { id in destinations = [.group(id)] }
                case .group(let id):
                    GroupChatView(groupID: id, store: groups.conversations.store(for: id))
                case .groupDetails(let id):
                    GroupMembersView(groupID: id, store: groups.conversations.store(for: id))
                case .groupInviteUser(let id):
                    InviteGroupUserView(groupID: id)
                case .groupAddContact(let id):
                    AddGroupContactView(groupID: id)
                case .groupContactConsent(let groupID, let contactID):
                    AddGroupContactConsentView(groupID: groupID, contactID: contactID)
                case .groupInvitations:
                    GroupInvitationsView { id in destinations = [.group(id)] }
                case .contacts:
                    ChatsView(
                        mode: .contacts,
                        openContact: { contact in destinations = [.contact(contact.id)] },
                        editContact: { contact in destinations.append(.editContact(contact.id)) },
                        openGroup: { group in destinations.append(.group(group.id)) }
                    )
                    .navigationTitle("Contacts")
                    .navigationBarTitleDisplayMode(.inline)
                case .addContact:
                    ContactEditorView()
                case .joinContact:
                    JoinSharedContactView { id in destinations = [.contact(id)] }
                case .contactInvitations:
                    ContactInvitationsView()
                case .receivedInvitation(let invitation):
                    ReceivedContactInvitationView(invitation: invitation) { contactID in
                        destinations = [.contact(contactID)]
                    }
                case .sharing(let id):
                    ContactSharingView(contactID: id, cache: contacts.sharingSnapshots.store(for: id))
                case .contact(let id):
                    ContactDetailView(contactID: id)
                case .schedules(let id):
                    SchedulesView(contactID: id, cache: contacts.scheduleSnapshots.store(for: id))
                case .editContact(let id):
                    if let contact = contacts.contact(id: id) {
                        ContactEditorView(contact: contact)
                    } else {
                        ContentUnavailableView("Contact not found", systemImage: "person.crop.circle.badge.questionmark")
                    }
                }
            }
        }
        .environment(groups)
        .environment(contacts)
        .environment(invitations)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { MessageSounds.shared.activate(userID: auth.user?.id) }
            else { MessageSounds.shared.deactivate() }
        }
        .onDisappear { MessageSounds.shared.reset() }
        .task(id: "\(contacts.hasLoaded)-\(groups.hasLoaded)-\(totalUnreadCount)-\(scenePhase)") {
            guard contacts.hasLoaded, groups.hasLoaded, scenePhase == .active else { return }
            await push.updateBadge(count: totalUnreadCount)
        }
        .task {
            await push.activate(using: auth, requestPermission: true)
            if contacts.hasLoaded && groups.hasLoaded { await push.updateBadge(count: totalUnreadCount) }
        }
        .task(id: push.deviceToken) { await push.synchronize(using: auth) }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            MessageSounds.shared.activate(userID: auth.user?.id)
            await contacts.refresh(using: auth, preserveLoadedPages: true)
            await groups.refresh(using: auth)
            await push.activate(using: auth)
            if contacts.hasLoaded && groups.hasLoaded { await push.updateBadge(count: totalUnreadCount) }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                await contacts.refresh(using: auth, preserveLoadedPages: true)
                await groups.refresh(using: auth, refreshInvitations: false)
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await groups.refresh(using: auth)
            await invitations.refresh(using: auth, force: true)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                await groups.refresh(using: auth)
                await invitations.refresh(using: auth)
            }
        }
        .task(id: push.destination?.id) {
            guard let destination = push.destination else { return }
            guard destination.userID == auth.user?.id else {
                push.destination = nil
                return
            }
            section = .chats
            switch destination.conversation {
            case .contact(let id):
                destinations = [.contact(id)]
                await contacts.conversations.store(for: id).refresh(contactID: id, using: auth)
            case .group(let id):
                destinations = [.group(id)]
                await groups.refresh(using: auth, refreshInvitations: false)
            }
            if push.destination?.id == destination.id { push.destination = nil }
        }
    }
}
