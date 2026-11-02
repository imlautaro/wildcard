import SwiftUI

/// The For you post a private message answers (docs/updates.md#continue-in-chat). It links to the
/// post itself rather than quoting it: tapping opens the post while it is still in For you.
struct MessagePostReferenceView: View {
    let post: HomePostReference
    var action: (() -> Void)? = nil
    /// Messages show it on its own tinted card; the composer places it on glass.
    var tinted = true
    private var accent: Color { HomeStyle.accent(post.accent ?? "blue") }
    private var label: String {
        post.available ? String(localized: "For you post: \(post.title)") : String(localized: "For you post: \(post.title). No longer in For you")
    }

    var body: some View {
        if let action, post.available {
            Button(action: action) { card }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityHint("Opens the post")
        } else {
            card
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
        }
    }

    private var card: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Label("For you post", systemImage: HomeStyle.symbol(post.icon ?? "star"))
                    .manrope(.caption2, weight: .semibold).foregroundStyle(accent).lineLimit(1)
                Text(post.title.isEmpty ? String(localized: "Post") : post.title).manrope(.caption, weight: .semibold).lineLimit(1)
                if let text = post.text, !text.isEmpty {
                    Text(text).manrope(.caption).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading)
                }
                if !post.available {
                    Text("No longer in For you").manrope(.caption2).italic().foregroundStyle(.tertiary)
                }
            }
            .padding(.vertical, 7)
            Spacer(minLength: 0)
        }
        .padding(.leading, 11).padding(.trailing, 8)
        .overlay(alignment: .leading) { Rectangle().fill(accent).frame(width: 3) }
        .fixedSize(horizontal: false, vertical: true)
        .background(tinted ? Color.primary.opacity(0.06) : .clear)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// Composer banner for the post the next message answers, with a button to drop it.
struct MessagePostComposerBar: View {
    let post: HomePostReference
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            MessagePostReferenceView(post: post, tinted: false)
            Button(action: onCancel) { Image(systemName: "xmark.circle.fill") }
                .buttonStyle(.plain).foregroundStyle(.secondary)
                .accessibilityLabel("Don’t reply to this post")
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
    }
}
