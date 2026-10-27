import SwiftUI

private struct MessageReactionsModifier: ViewModifier {
    let store: MessageReactionStore
    let path: String
    let messageID: String
    let side: String
    let fromUser: Bool
    let enabled: Bool
    let onReply: (() -> Void)?
    @Environment(AuthStore.self) private var auth
    @State private var showsPicker = false
    private var key: String { "\(messageID)/\(side)" }
    private var rows: [MessageReaction] { store.rows.filter { $0.messageID == messageID && $0.side == side } }
    private var own: String? { rows.first { $0.actorID == "user/\(auth.user?.id ?? "")" }?.emoji }
    private func choose(_ emoji: String?) {
        showsPicker = false
        Task { await store.set(path: path, messageID: messageID, side: side, emoji: emoji, auth: auth) }
    }

    func body(content: Content) -> some View {
        VStack(alignment: fromUser ? .trailing : .leading, spacing: 3) {
            content
                .contentShape(Rectangle())
                .highPriorityGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in if enabled { showsPicker = true } })
                .accessibilityAction(named: "React to message") { if enabled { showsPicker = true } }
                .accessibilityActions {
                    if enabled, let onReply { Button("Reply", action: onReply) }
                }
            if !rows.isEmpty {
                HStack(spacing: 4) {
                    ForEach(MessageReactionStore.emojis, id: \.self) { emoji in
                        let count = rows.filter { $0.emoji == emoji }.count
                        if count > 0 {
                            Button { showsPicker = true } label: {
                                Text("\(emoji) \(count)").font(.caption)
                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                    .background(own == emoji ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.12), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(emoji): \(rows.filter { $0.emoji == emoji }.map(\.name).joined(separator: ", "))")
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: fromUser ? .trailing : .leading)
            }
            if let pending = store.pending[key], let error = store.errors[key] {
                HStack {
                    Text(error).font(.caption)
                    Button("Retry reaction") { choose(pending.emoji) }.disabled(store.busy.contains(key))
                }
            }
        }
        .popover(isPresented: $showsPicker) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    ForEach(MessageReactionStore.emojis, id: \.self) { emoji in
                        Button { choose(own == emoji ? nil : emoji) } label: {
                            Text(emoji).font(.title2).padding(5)
                                .background(own == emoji ? Color.accentColor.opacity(0.18) : .clear, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("React \(emoji)")
                        .disabled(store.busy.contains(key))
                    }
                }
                if let onReply {
                    Button("Reply", systemImage: "arrowshape.turn.up.left") {
                        showsPicker = false
                        onReply()
                    }
                }
                if own != nil { Button("Remove reaction") { choose(nil) }.disabled(store.busy.contains(key)) }
                if !rows.isEmpty {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(rows, id: \.actorID) { row in Text("\(row.emoji) \(row.name)").font(.subheadline) }
                        }
                    }.frame(maxHeight: 160)
                }
            }
            .padding(12)
            .presentationCompactAdaptation(.popover)
        }
    }
}

extension View {
    func messageReactions(_ store: MessageReactionStore, path: String, messageID: String, side: String, fromUser: Bool, enabled: Bool = true,
                          onReply: (() -> Void)? = nil) -> some View {
        modifier(MessageReactionsModifier(store: store, path: path, messageID: messageID, side: side, fromUser: fromUser, enabled: enabled, onReply: onReply))
    }
}
