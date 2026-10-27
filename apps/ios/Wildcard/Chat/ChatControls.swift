import SwiftUI

private struct ChatComposerFieldStyle: ViewModifier {
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44

    func body(content: Content) -> some View {
        content
            .manrope().lineLimit(1...6)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: height)
            .glassEffect(.regular, in: Capsule())
    }
}

extension View {
    func chatComposerFieldStyle() -> some View { modifier(ChatComposerFieldStyle()) }
}

struct ChatComposerActionButton: View {
    let symbol: String
    let label: String
    let isEnabled: Bool
    var tint: Color = .accentColor
    let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 20

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: height, height: height)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(tint).interactive(), in: Circle())
        .opacity(isEnabled ? 1 : 0.4)
        .accessibilityLabel(label)
        .disabled(!isEnabled)
    }
}

struct ChatScrollToLatestButton: View {
    let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 20

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.down")
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(.primary)
                .frame(width: height, height: height)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Circle())
        .accessibilityLabel("Scroll to latest message")
    }
}
