import SwiftUI

struct MessageReceiptView: View {
    let sentAt: Double
    var readAt: Double? = nil
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .caption2) private var width: CGFloat = 16
    @ScaledMetric(relativeTo: .caption2) private var height: CGFloat = 9.6
    @ScaledMetric(relativeTo: .caption2) private var lineWidth: CGFloat = 1.3

    private var readColor: Color {
        colorScheme == .dark ? Color(red: 0.6, green: 0.9, blue: 1) : .accentColor
    }

    var body: some View {
        ReceiptChecks(doubled: true)
            .stroke(style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            .foregroundStyle(readAt != nil ? readColor : Color.secondary)
            .frame(width: width, height: height)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(readAt != nil ? "Read" : "Received")
    }
}

struct ReplyTypingIndicator: View {
    var body: some View {
        HStack {
            AnimatedTypingLabel()
            Spacer()
        }
        .transition(.opacity)
    }
}

private struct AnimatedTypingLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @ScaledMetric(relativeTo: .subheadline) private var dotSize: CGFloat = 3

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.1, paused: reduceMotion || scenePhase != .active)) { context in
            HStack(spacing: 3) {
                Text("Typing").manrope(.subheadline)
                HStack(spacing: 3) {
                    ForEach(0..<3) { index in
                        let phase = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.2)
                        let wave = reduceMotion ? 1 : (sin((phase / 1.2 - Double(index) * 0.16) * 2 * .pi) + 1) / 2
                        Circle()
                            .frame(width: dotSize, height: dotSize)
                            .opacity(0.3 + 0.7 * wave)
                    }
                }
                .padding(.top, 6)
            }
        }
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Typing")
    }
}

private struct ReceiptChecks: Shape {
    let doubled: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + rect.width * x / 20, y: rect.minY + rect.height * y / 12)
        }
        let inset: CGFloat = doubled ? 0 : 3
        path.move(to: point(1 + inset, 6))
        path.addLine(to: point(5 + inset, 10))
        path.addLine(to: point(13 + inset, 2))
        if doubled {
            path.move(to: point(9, 8))
            path.addLine(to: point(11, 10))
            path.addLine(to: point(19, 2))
        }
        return path
    }
}
