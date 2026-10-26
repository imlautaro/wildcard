import SwiftUI

struct ChatsView: View {
    var body: some View {
        List {
            EmptyView()
        }
        .overlay {
            ContentUnavailableView {
                Label("No contacts yet", systemImage: "person.crop.circle.badge.plus")
                    .manrope(.title2, weight: .semibold)
            } description: {
                Text("Tap + to create your first contact.")
                    .manrope()
            }
        }
    }
}
