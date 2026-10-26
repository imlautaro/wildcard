import SwiftUI

struct MessageBubbleView: View {
    let text: String
    let sentAt: Double
    let fromUser: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            ViewThatFits(in: .horizontal) {
                if !text.contains(where: \.isNewline) {
                    HStack(alignment: .lastTextBaseline, spacing: 8) {
                        messageText.fixedSize(horizontal: true, vertical: true)
                        metadata
                    }
                    .fixedSize(horizontal: true, vertical: false)
                }
                VStack(alignment: .trailing, spacing: 4) {
                    messageText.fixedSize(horizontal: false, vertical: true)
                    metadata
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .foregroundStyle(Color.primary)
            .background(fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 20))
            if !fromUser { Spacer(minLength: 40) }
        }
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: fromUser ? 8 : -8, y: 4)))
    }

    private var messageText: some View {
        Text(text).manrope().multilineTextAlignment(.leading).textSelection(.enabled)
    }

    private var metadata: some View {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text(Date(timeIntervalSince1970: sentAt / 1000), format: .dateTime.hour().minute())
                .manrope(.caption2)
                .foregroundStyle(.secondary)
            if fromUser { MessageReceiptView(sentAt: sentAt) }
        }
        .fixedSize()
    }
}
