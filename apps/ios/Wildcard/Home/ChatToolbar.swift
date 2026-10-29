import SwiftUI

/// Chat headers sit in the leading toolbar slot. A fixed width that leaves room for the
/// back button and the actions menu makes long names truncate; an unbounded header makes
/// the system move the whole avatar/title/subtitle segment into the toolbar overflow.
enum ChatHeaderLayout {
    /// Back button, actions menu, bar margins and spacing.
    private static let reserved: CGFloat = 160

    static func width(barWidth: CGFloat) -> CGFloat { max(120, barWidth - reserved) }
}

/// Every chat action lives in one menu, so the bar never overflows into the system menu.
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
