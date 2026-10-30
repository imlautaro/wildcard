import SwiftUI

/// Chat headers use the principal title slot instead of an overflow-eligible side action.
/// Bound their width to leave room for the back button and actions menu, truncating long names.
enum ChatHeaderLayout {
    /// Back button, actions menu, bar margins and spacing.
    private static let reserved: CGFloat = 160

    static func width(barWidth: CGFloat) -> CGFloat { max(120, barWidth - reserved) }
}

/// Chat actions share one trailing menu, separate from the principal identity header.
/// Actions are buttons that push onto the Home stack; a `NavigationLink` inside a toolbar
/// menu does not navigate reliably.
struct ChatActionsMenu<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        Menu { content } label: { Image(systemName: "ellipsis") }
            .tint(Color(uiColor: .label))
            .accessibilityLabel("Chat actions")
    }
}
