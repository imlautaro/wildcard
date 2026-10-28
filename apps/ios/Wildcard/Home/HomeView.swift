import SwiftUI

enum HomeDestination: Hashable {
    case contacts
    case nativeExperiments
    case nativeTools(String)
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
    @Environment(NativeExperiments.self) private var native
    @Environment(\.scenePhase) private var scenePhase
    private enum Section: Hashable {
        case chats
        case account

        var title: String { self == .chats ? "Chats" : "Account" }
    }

    @State private var nativeRouteError: String?
    @State private var showNativeInbox = false
    @State private var section: Section = .chats
    @State private var destinations: [HomeDestination] = []
    @State private var sync = ConversationSync()
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
                case .nativeExperiments:
                    NativeExperimentsDirectoryView()
                case .nativeTools(let id):
                    NativeToolsView(contactID: id)
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
        .environment(sync)
        .sheet(isPresented: $showNativeInbox) { NavigationStack { NativeInboxView() }.environment(contacts) }
        .onChange(of: contacts.nativeDirectoryContacts) { _, values in
            if let userID = auth.user?.id { native.activate(userID: userID, contacts: values) }
        }
        .task {
            if let userID = auth.user?.id { native.activate(userID: userID, contacts: contacts.nativeDirectoryContacts) }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await native.runAutomatically(using: auth)
                native.refreshLocalAlarms()
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await native.observeAlarmChanges()
        }
        .task(id: native.route?.id) {
            guard let route = native.route else { return }
            do {
                let id: String
                if let direct = route.contactID {
                    try await contacts.refreshContact(id: direct, using: auth, force: true)
                    id = direct
                } else if let agentID = route.agentID {
                    var cursor: String? = nil
                    var found: Contact?
                    var pages = 0
                    repeat {
                        let page = try await auth.withSession { api, token in try await api.contacts(token: token, before: cursor) }
                        found = page.contacts.first { $0.agentID == agentID }
                        cursor = page.nextCursor; pages += 1
                    } while found == nil && cursor != nil && !Task.isCancelled && pages < 40
                    guard let found else { nativeRouteError = "This contact link requires an existing invitation and accepted access."; native.route = nil; return }
                    id = found.id
                    try await contacts.refreshContact(id: id, using: auth, force: true)
                } else { return }
                guard !Task.isCancelled, native.route?.id == route.id else { return }
                section = .chats; destinations = [.contact(id)]
                native.reloadDrafts()
                if let draftID = route.draftID { native.selectedDraft = native.drafts.first { $0.id == draftID } }
            } catch is CancellationError { return }
            catch { nativeRouteError = error.localizedDescription }
            if native.route?.id == route.id { native.route = nil }
        }
        .alert("Unable to open contact", isPresented: Binding(get: { nativeRouteError != nil }, set: { if !$0 { nativeRouteError = nil } })) {
            Button("OK") { nativeRouteError = nil }
        } message: { Text(nativeRouteError ?? "") }
        .safeAreaInset(edge: .top, spacing: 0) {
            if case .contact = destinations.last {} else {
                NativeActiveStatusView(contactID: nil)
            }
            if let error = native.error {
                HStack {
                    Text(error).font(.footnote)
                    Button("Dismiss") { native.error = nil }
                }.padding(8).frame(maxWidth: .infinity).background(.bar)
            }
            if !native.drafts.isEmpty {
                Button { showNativeInbox = true } label: {
                    Label("Review shared drafts (\(native.drafts.count))", systemImage: "tray.and.arrow.down")
                        .font(.footnote).padding(8).frame(maxWidth: .infinity)
                }.background(.bar)
            }
        }
        .environment(groups)
        .onChange(of: destinations) { _, path in
            switch path.last {
            case .contact(let id): sync.visible = .contact(id)
            case .group(let id): sync.visible = .group(id)
            default: sync.visible = nil
            }
            sync.request(sync.visible)
        }
        .onChange(of: auth.user?.chatModel) { _, _ in
            contacts.sharingSnapshots.removeAll()
            for group in groups.groups {
                groups.conversations.cachedStore(for: group.id)?.invalidateDetails()
            }
            sync.request()
            Task {
                await groups.refresh(using: auth)
                await invitations.refresh(using: auth, force: true)
            }
        }
        .onChange(of: push.incomingEvent) { _, event in
            guard let event, event.userID == auth.user?.id else { return }
            sync.request(event.conversation)
        }
        .environment(contacts)
        .environment(invitations)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { MessageSounds.shared.activate(userID: auth.user?.id); native.reloadDrafts() }
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
        .task(id: "\(push.deviceToken ?? "")-\(native.remoteEnabled.sorted())-\(native.enabled.map { $0.key + $0.value.sorted().joined() }.sorted())") {
            await push.synchronize(using: auth)
            await native.syncRemoteRegistration(using: auth)
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            MessageSounds.shared.activate(userID: auth.user?.id)
            await sync.run(contacts: contacts, groups: groups, auth: auth)
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await groups.refreshInbox(using: auth)
            await invitations.refresh(using: auth, force: true)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                await groups.refreshInbox(using: auth)
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
