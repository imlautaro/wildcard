import SwiftUI
import UIKit

/// A quoted message with the author label and accent shown by the current conversation.
struct MessageReplyPreview: Equatable {
    let quote: MessageReplyQuote
    let author: String
    let color: Color
}

extension MessageReplyQuote {
    /// Local quote for the composer and the optimistic bubble, clipped to 200 code points like the server's.
    static func local(messageID: String, side: String, text: String, attachment: ChatAttachment?,
                      userID: String? = nil, agentID: String? = nil, senderName: String? = nil) -> MessageReplyQuote {
        let scalars = text.unicodeScalars
        let clipped = scalars.count > 200 ? String(String.UnicodeScalarView(scalars.prefix(200))) + "…" : text
        let previewSource = side == "assistant" || agentID != nil ? MessageMarkdown.plainText(text) : text
        let previewScalars = previewSource.unicodeScalars
        let previewText = previewScalars.count > 200 ? String(String.UnicodeScalarView(previewScalars.prefix(200))) + "…" : previewSource
        return MessageReplyQuote(messageID: messageID, side: side, available: true, userID: userID, agentID: agentID,
                                 senderName: senderName, text: clipped, previewText: previewText, attachment: attachment)
    }
}

struct MessageReplyQuoteView: View {
    let preview: MessageReplyPreview
    var action: (() -> Void)? = nil
    /// Bubbles tint the quote; the composer places it on its own glass card.
    var tinted = true
    private var beforeJoin: Bool { preview.quote.beforeJoin == true }
    private var label: String {
        "Reply to \(preview.author): \(MessageReplySummary.description(preview.quote))" + (beforeJoin ? ". Before you joined" : "")
    }

    var body: some View {
        // Only an available quote with an action is a button; others stay plain content.
        // A quote from before the viewer joined cannot be opened: its message is outside their history.
        if let action, preview.quote.available, !beforeJoin {
            Button(action: action) { quote }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityHint("Shows the original message")
        } else {
            quote
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
        }
    }

    private var quote: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(preview.author).manrope(.caption, weight: .semibold)
                    .foregroundStyle(preview.color).lineLimit(1)
                MessageReplySummary(quote: preview.quote)
                if beforeJoin {
                    Text("Before you joined").manrope(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                }
            }
            .padding(.vertical, 6)
            Spacer(minLength: 0)
        }
        .padding(.leading, 11).padding(.trailing, 8)
        // An overlay takes the content's height; a shape in the stack would fill
        // every point of height offered by the composer bar.
        .overlay(alignment: .leading) { Rectangle().fill(preview.color).frame(width: 3) }
        .fixedSize(horizontal: false, vertical: true)
        .background(tinted ? Color.primary.opacity(0.06) : .clear)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .contentShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct MessageReplySummary: View {
    let quote: MessageReplyQuote

    static func description(_ quote: MessageReplyQuote) -> String {
        guard quote.available else { return "Original message unavailable" }
        if let sticker = quote.attachment?.sticker, quote.available { return "Sticker \(sticker.emoji)" }
        if !quote.text.isEmpty { return quote.previewText ?? (quote.side == "assistant" || quote.agentID != nil ? MessageMarkdown.plainText(quote.text) : quote.text) }
        guard let attachment = quote.attachment else { return "" }
        if let sticker = attachment.sticker { return "Sticker \(sticker.emoji)" }
        return attachment.isImage ? "Photo" : attachment.name
    }

    var body: some View {
        HStack(spacing: 4) {
            if quote.available, let attachment = quote.attachment {
                Image(systemName: attachment.isSticker ? "face.smiling" : attachment.isImage ? "photo" : "doc.richtext")
            }
            Text(Self.description(quote)).italic(!quote.available)
                .lineLimit(2).multilineTextAlignment(.leading)
        }
        .manrope(.caption)
        .foregroundStyle(.secondary)
    }
}

/// Composer banner for the message being replied to, with a cancel button.
struct MessageReplyComposerBar: View {
    let preview: MessageReplyPreview
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrowshape.turn.up.left.fill").foregroundStyle(preview.color)
                .accessibilityHidden(true)
            MessageReplyQuoteView(preview: preview, tinted: false)
            Button(action: onCancel) { Image(systemName: "xmark.circle.fill") }
                .buttonStyle(.plain).foregroundStyle(.secondary)
                .accessibilityLabel("Cancel reply")
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
        // Matches the composer field's glass treatment.
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
    }
}

/// Lays out a bubble's sender, quote and text so the quote spans the widest line
/// without stretching short bubbles to the full screen width.
struct MessageBubbleStack: Layout {
    var spacing: CGFloat = 4

    private func width(_ proposal: ProposedViewSize, _ subviews: Subviews) -> CGFloat {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        return proposal.width.map { min(ideal, $0) } ?? ideal
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = width(proposal, subviews)
        let heights = subviews.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)).height }
        return CGSize(width: width, height: heights.reduce(0, +) + spacing * CGFloat(max(0, subviews.count - 1)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for subview in subviews {
            let height = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil)).height
            subview.place(at: CGPoint(x: bounds.minX, y: y), proposal: ProposedViewSize(width: bounds.width, height: height))
            y += height + spacing
        }
    }
}

/// A rightward pan that only begins when horizontal, leaving vertical scrolling to the ScrollView.
private struct HorizontalReplyPan: UIGestureRecognizerRepresentable {
    let enabled: Bool
    let onChange: (CGFloat) -> Void
    let onEnd: (CGFloat) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let recognizer = UIPanGestureRecognizer()
        recognizer.delegate = context.coordinator
        recognizer.isEnabled = enabled
        return recognizer
    }

    func updateUIGestureRecognizer(_ recognizer: UIPanGestureRecognizer, context: Context) {
        recognizer.isEnabled = enabled
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let translation = max(0, recognizer.translation(in: recognizer.view).x)
        switch recognizer.state {
        case .began, .changed: onChange(translation)
        case .ended, .cancelled, .failed: onEnd(translation)
        default: break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view = touch.view
            while let current = view {
                if current is UISlider { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return velocity.x > 0 && abs(velocity.x) > abs(velocity.y) * 1.5
        }
    }
}

private struct SwipeToReplyModifier: ViewModifier {
    let enabled: Bool
    let action: () -> Void
    @State private var offset: CGFloat = 0
    @State private var armed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let threshold: CGFloat = 56

    // One view structure regardless of `enabled`, so a bubble that becomes
    // repliable (an accepted optimistic send) keeps its identity and state.
    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .background(alignment: .leading) {
                if offset > 0 {
                    Image(systemName: "arrowshape.turn.up.left.fill")
                        .foregroundStyle(.secondary)
                        .padding(8).background(.quaternary, in: Circle())
                        .scaleEffect(armed ? 1 : 0.7)
                        .opacity(min(1, offset / threshold))
                        .offset(x: min(offset, threshold) - 40)
                        .accessibilityHidden(true)
                }
            }
            .gesture(HorizontalReplyPan(enabled: enabled, onChange: { translation in
                // Resist beyond the threshold so the bubble cannot be dragged away.
                offset = min(translation, threshold) + max(0, translation - threshold) * 0.2
                armed = translation >= threshold
            }, onEnd: { translation in
                if translation >= threshold && enabled { action() }
                armed = false
                withAnimation(reduceMotion ? nil : .spring(duration: 0.25)) { offset = 0 }
            }))
            .sensoryFeedback(.impact(weight: .light), trigger: armed) { _, isArmed in isArmed }
    }
}

extension View {
    /// Swipe a message to the right to reply, like common messaging apps.
    func swipeToReply(enabled: Bool = true, action: @escaping () -> Void) -> some View {
        modifier(SwipeToReplyModifier(enabled: enabled, action: action))
    }

    /// Briefly tints a message after navigating to it from a quote.
    func messageHighlight(_ highlighted: Bool) -> some View {
        background(highlighted ? Color.accentColor.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 14))
    }
}
