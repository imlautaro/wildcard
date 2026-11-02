import SwiftUI

private struct ChatComposerFieldStyle: ViewModifier {
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44

    func body(content: Content) -> some View {
        content
            .manrope().lineLimit(1...6)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: height)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

extension View {
    func chatComposerFieldStyle() -> some View { modifier(ChatComposerFieldStyle()) }
}

struct ChatComposerActionButton: View {
    let symbol: String
    let label: LocalizedStringKey
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

/// Keeps the native content edge aligned while layout settles, until the reader takes control.
struct ChatHistoryPosition {
    var position = ScrollPosition(edge: .bottom)
    var followsLatest = true

    mutating func scrollToLatest() {
        followsLatest = true
        position.scrollTo(edge: .bottom)
    }
}

private struct ChatHistoryLayout: Equatable {
    let contentSize: CGSize
    let containerSize: CGSize
    let insets: EdgeInsets

    init(_ geometry: ScrollGeometry) {
        contentSize = geometry.contentSize
        containerSize = geometry.containerSize
        insets = geometry.contentInsets
    }
}

private struct ChatHistoryPositionModifier: ViewModifier {
    @Binding var history: ChatHistoryPosition
    @State private var phase: ScrollPhase = .idle

    func body(content: Content) -> some View {
        content
            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .defaultScrollAnchor(.bottom, for: .alignment)
            .scrollPosition($history.position)
            .onScrollGeometryChange(for: ChatHistoryLayout.self) { ChatHistoryLayout($0) } action: { _, _ in
                // Offset changes are deliberately excluded, so this cannot chase its own scroll.
                if phase == .idle { alignToBottom() }
            }
            .onScrollPhaseChange { _, next, context in
                phase = next
                if next == .tracking || next == .interacting {
                    history.followsLatest = false
                } else if next == .idle {
                    let geometry = context.geometry
                    let bottom = max(-geometry.contentInsets.top,
                                     geometry.contentSize.height + geometry.contentInsets.bottom - geometry.containerSize.height)
                    if bottom - geometry.contentOffset.y > 1 { alignToBottom() }
                }
            }
            .onAppear { alignToBottom() }
    }

    private func alignToBottom() {
        guard history.followsLatest else { return }
        var transaction = Transaction(animation: nil)
        transaction.disablesAnimations = true
        withTransaction(transaction) { history.position.scrollTo(edge: .bottom) }
    }
}

extension View {
    func chatHistoryPosition(_ history: Binding<ChatHistoryPosition>) -> some View {
        modifier(ChatHistoryPositionModifier(history: history))
    }
}
