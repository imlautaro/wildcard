import SwiftUI

struct HomeView: View {
    private enum Section: Hashable {
        case chats
        case account

        var title: String { self == .chats ? "Chats" : "Account" }
    }

    private enum Destination: Hashable {
        case addContact
    }

    @State private var section: Section = .chats
    @State private var destinations: [Destination] = []

    var body: some View {
        NavigationStack(path: $destinations) {
            TabView(selection: $section) {
                Tab("Chats", systemImage: "bubble.left.and.bubble.right", value: Section.chats) {
                    ChatsView()
                }
                Tab("Account", systemImage: "person.crop.circle", value: Section.account) {
                    AccountView()
                }
            }
            .navigationTitle(section.title)
            .toolbar {
                if section == .chats {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: Destination.addContact) {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add contact")
                    }
                }
            }
            // Destinations replace the complete tab layout, sharing one back stack.
            .navigationDestination(for: Destination.self) { destination in
                switch destination {
                case .addContact:
                    AddContactView()
                }
            }
        }
    }
}
