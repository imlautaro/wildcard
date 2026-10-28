import SwiftUI

struct MessageBubbleView: View {
    let text: String
    let sentAt: Double
    let fromUser: Bool
    var receiptState: String? = nil
    var readAt: Double? = nil
    var isSending = false
    var showsReceipt = true
    var formatsMarkdown = false
    var senderName: String? = nil
    var senderColor: Color? = nil
    var replyQuote: MessageReplyPreview? = nil
    var onQuoteTap: (() -> Void)? = nil
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            Group {
                if let replyQuote {
                    MessageBubbleStack(spacing: 6) {
                        if let senderName { MessageSenderNameView(name: senderName, color: senderColor) }
                        MessageReplyQuoteView(preview: replyQuote, action: onQuoteTap)
                        MessageTextContentView(text: text, sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt, isSending: isSending, showsReceipt: showsReceipt, fillsWidth: true, formatsMarkdown: formatsMarkdown)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        if let senderName { MessageSenderNameView(name: senderName, color: senderColor) }
                        MessageTextContentView(text: text, sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt, isSending: isSending, showsReceipt: showsReceipt, formatsMarkdown: formatsMarkdown)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .foregroundStyle(Color.primary)
            .background(fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground),
                        in: MessageBubbleShape(fromUser: fromUser))
            if !fromUser { Spacer(minLength: 40) }
        }
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: fromUser ? 8 : -8, y: 4)))
    }

}

struct MessageSenderNameView: View {
    let name: String
    var color: Color? = nil

    var body: some View {
        Text(name).manrope(.caption, weight: .semibold)
            .foregroundStyle(color ?? Color.secondary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct MessageTextContentView: View {
    let text: String
    let sentAt: Double
    let fromUser: Bool
    var receiptState: String? = nil
    var readAt: Double? = nil
    var isSending = false
    var showsReceipt = true
    var fillsWidth = false
    var formatsMarkdown = false
    @ScaledMetric(relativeTo: .body) private var markdownSize: CGFloat = 17

    var body: some View {
        let markdown = formatsMarkdown ? MessageMarkdown(text) : nil
        let inline = markdown?.inlineText
        ViewThatFits(in: .horizontal) {
            if !text.contains(where: \.isNewline) && (!formatsMarkdown || inline != nil) {
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    messageText(markdown).fixedSize(horizontal: true, vertical: true)
                    if fillsWidth { Spacer(minLength: 0) }
                    MessageMetadataView(sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt, isSending: isSending, showsReceipt: showsReceipt)
                }
                .fixedSize(horizontal: !fillsWidth, vertical: false)
            }
            VStack(alignment: .trailing, spacing: 4) {
                messageText(markdown).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: fillsWidth ? .infinity : nil, alignment: .leading)
                MessageMetadataView(sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt, isSending: isSending, showsReceipt: showsReceipt)
            }
        }
    }

    @ViewBuilder private func messageText(_ markdown: MessageMarkdown?) -> some View {
        if let inline = markdown?.inlineText {
            Text(MessageMarkdown.styled(inline, size: markdownSize)).multilineTextAlignment(.leading).textSelection(.enabled)
        } else if let markdown {
            MessageMarkdownView(markdown: markdown)
        } else {
            Text(text).manrope().multilineTextAlignment(.leading).textSelection(.enabled)
        }
    }
}

struct MessageMetadataView: View {
    let sentAt: Double
    let fromUser: Bool
    var receiptState: String? = nil
    var readAt: Double? = nil
    var isSending = false
    var showsReceipt = true

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text(Date(timeIntervalSince1970: sentAt / 1000), format: .dateTime.hour().minute())
                .manrope(.caption2)
                .foregroundStyle(.secondary)
            if fromUser && showsReceipt { MessageReceiptView(sentAt: sentAt, readAt: readAt, isSending: isSending, receiptState: receiptState) }
        }
        .fixedSize()
    }
}

struct MessageBubbleShape: Shape {
    var cornerRadius: CGFloat = 20
    var fromUser: Bool = true

    func path(in rect: CGRect) -> Path {
        guard cornerRadius > 0 else { return Path(rect) }
        let radius = min(cornerRadius, rect.width / 2, rect.height / 2)
        let tailHeight = min(15, rect.height / 2)
        let left = rect.minX
        let right = rect.maxX
        let top = rect.minY
        let bottom = rect.maxY
        var path = Path()
        path.move(to: CGPoint(x: left + radius, y: top))
        path.addLine(to: CGPoint(x: right - radius / 2, y: top))
        path.addCurve(to: CGPoint(x: right + 4.2, y: top - 2.1),
                      control1: CGPoint(x: right - 3, y: top),
                      control2: CGPoint(x: right + 2, y: top - 1))
        // Round the tip with a short curve instead of meeting at a sharp vertex.
        path.addQuadCurve(to: CGPoint(x: right + 5.1, y: top - 1.2),
                          control: CGPoint(x: right + 6.2, y: top - 3.1))
        path.addCurve(to: CGPoint(x: right, y: top + tailHeight),
                      control1: CGPoint(x: right + 3, y: top + 3),
                      control2: CGPoint(x: right, y: top + 8))
        path.addLine(to: CGPoint(x: right, y: bottom - radius))
        path.addQuadCurve(to: CGPoint(x: right - radius, y: bottom),
                          control: CGPoint(x: right, y: bottom))
        path.addLine(to: CGPoint(x: left + radius, y: bottom))
        path.addQuadCurve(to: CGPoint(x: left, y: bottom - radius),
                          control: CGPoint(x: left, y: bottom))
        path.addLine(to: CGPoint(x: left, y: top + radius))
        path.addQuadCurve(to: CGPoint(x: left + radius, y: top),
                          control: CGPoint(x: left, y: top))
        path.closeSubpath()
        let lowerTail = path.applying(CGAffineTransform(a: 1, b: 0, c: 0, d: -1,
                                                      tx: 0, ty: rect.minY + rect.maxY))
        return fromUser ? lowerTail : lowerTail.applying(CGAffineTransform(a: -1, b: 0, c: 0, d: 1,
                                                                         tx: rect.minX + rect.maxX, ty: 0))
    }
}
