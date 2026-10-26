import SwiftUI

enum HomeDestination: Hashable {
    case addContact
    case contact(String)
    case renameContact(String)
}

struct HomeView: View {
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
                    ChatsView { contact in destinations.append(.renameContact(contact.id)) }
                }
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
                case .renameContact(let id):
                    if let contact = contacts.contact(id: id) {
                        ContactEditorView(contact: contact)
                    } else {
                        ContentUnavailableView("Contact not found", systemImage: "person.crop.circle.badge.questionmark")
                    }
                }
            }
        }
        .environment(contacts)
    }
}
