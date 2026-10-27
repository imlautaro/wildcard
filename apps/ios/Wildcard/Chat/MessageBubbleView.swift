import SwiftUI

struct MessageBubbleView: View {
    let text: String
    let sentAt: Double
    let fromUser: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            MessageTextContentView(text: text, sentAt: sentAt, fromUser: fromUser)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .foregroundStyle(Color.primary)
            .background(fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground),
                        in: MessageBubbleShape(fromUser: fromUser))
            if !fromUser { Spacer(minLength: 40) }
        }
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: fromUser ? 8 : -8, y: 4)))
    }

}

struct MessageTextContentView: View {
    let text: String
    let sentAt: Double
    let fromUser: Bool
    var fillsWidth = false

    var body: some View {
        ViewThatFits(in: .horizontal) {
            if !text.contains(where: \.isNewline) {
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    messageText.fixedSize(horizontal: true, vertical: true)
                    if fillsWidth { Spacer(minLength: 0) }
                    MessageMetadataView(sentAt: sentAt, fromUser: fromUser)
                }
                .fixedSize(horizontal: !fillsWidth, vertical: false)
            }
            VStack(alignment: .trailing, spacing: 4) {
                messageText.fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: fillsWidth ? .infinity : nil, alignment: .leading)
                MessageMetadataView(sentAt: sentAt, fromUser: fromUser)
            }
        }
    }

    private var messageText: some View {
        Text(text).manrope().multilineTextAlignment(.leading).textSelection(.enabled)
    }
}

struct MessageMetadataView: View {
    let sentAt: Double
    let fromUser: Bool

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text(Date(timeIntervalSince1970: sentAt / 1000), format: .dateTime.hour().minute())
                .manrope(.caption2)
                .foregroundStyle(.secondary)
            if fromUser { MessageReceiptView(sentAt: sentAt) }
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
        return fromUser ? path : path.applying(CGAffineTransform(a: -1, b: 0, c: 0, d: 1,
                                                               tx: rect.minX + rect.maxX, ty: 0))
    }
}
