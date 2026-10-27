import SwiftUI

enum HomeDestination: Hashable {
    case addContact
    case contact(String)
    case editContact(String)
    case schedules(String)
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

    var body: some View {
        NavigationStack(path: $destinations) {
            TabView(selection: $section) {
                Tab("Chats", systemImage: "bubble.left.and.bubble.right", value: Section.chats) {
                    ChatsView(
                        openContact: { contact in destinations.append(.contact(contact.id)) },
                        editContact: { contact in destinations.append(.editContact(contact.id)) }
                    )
                }
                .badge(contacts.totalUnreadCount)
                Tab("Account", systemImage: "person.crop.circle", value: Section.account) {
                    AccountView()
                }
            }
            .navigationTitle(section.title)
            .toolbar {
                if section == .chats && destinations.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: HomeDestination.addContact) {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add contact")
                        .disabled(contacts.isMutating)
                    }
                }
            }
            // Destinations replace the complete tab layout, sharing one back stack.
            .navigationDestination(for: HomeDestination.self) { destination in
                switch destination {
                case .addContact:
                    ContactEditorView()
                case .contact(let id):
                    ContactDetailView(contactID: id)
                case .schedules(let id):
                    SchedulesView(contactID: id)
                case .editContact(let id):
                    if let contact = contacts.contact(id: id) {
                        ContactEditorView(contact: contact)
                    } else {
                        ContentUnavailableView("Contact not found", systemImage: "person.crop.circle.badge.questionmark")
                    }
                }
            }
        }
        .environment(contacts)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { MessageSounds.shared.activate(userID: auth.user?.id) }
            else { MessageSounds.shared.deactivate() }
        }
        .onDisappear { MessageSounds.shared.reset() }
        .task(id: "\(contacts.hasLoaded)-\(contacts.totalUnreadCount)-\(scenePhase)") {
            guard contacts.hasLoaded, scenePhase == .active else { return }
            await push.updateBadge(count: contacts.totalUnreadCount)
        }
        .task {
            await push.activate(using: auth, requestPermission: true)
            if contacts.hasLoaded { await push.updateBadge(count: contacts.totalUnreadCount) }
        }
        .task(id: push.deviceToken) { await push.synchronize(using: auth) }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            MessageSounds.shared.activate(userID: auth.user?.id)
            await contacts.refresh(using: auth, preserveLoadedPages: true)
            await push.activate(using: auth)
            if contacts.hasLoaded { await push.updateBadge(count: contacts.totalUnreadCount) }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                await contacts.refresh(using: auth, preserveLoadedPages: true)
            }
        }
        .task(id: push.destination?.id) {
            guard let destination = push.destination else { return }
            guard destination.userID == auth.user?.id else {
                push.destination = nil
                return
            }
            section = .chats
            destinations = [.contact(destination.contactID)]
            await contacts.conversations.store(for: destination.contactID)
                .refresh(contactID: destination.contactID, using: auth)
            if push.destination?.id == destination.id { push.destination = nil }
        }
    }
}
