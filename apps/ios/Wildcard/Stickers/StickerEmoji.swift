import SwiftUI

enum StickerEmoji {
    /// Common emojis offered in the chooser; any other single emoji can be typed.
    static let common: [String] = [
        "😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎",
        "🤔", "😅", "😭", "😢", "😡", "🥳", "😴", "🤯",
        "😱", "🙄", "😏", "🥺", "🤗", "🙃", "😇", "🤩",
        "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋",
        "❤️", "💔", "🔥", "✨", "🎉", "💯", "⭐", "🌈",
        "🐶", "🐱", "🦄", "🐻", "🐸", "🙈", "🍕", "🍔",
        "☕", "🍺", "🎂", "⚽", "🎮", "🎵", "🚀", "🌍",
        "🏠", "💼", "📚", "💡", "⏰", "✅", "❌", "🤷",
    ]

    /// Exactly one grapheme that is a pictograph, flag or keycap (the server rule in
    /// `validStickerEmoji`, `apps/api/src/stickers/data.ts`). Returns the cleaned emoji or nil.
    static func validated(_ text: String) -> String? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.count == 1, let character = value.first, value.utf16.count <= 32 else { return nil }
        let scalars = Array(character.unicodeScalars)
        guard let first = scalars.first else { return nil }
        if scalars.count >= 2, scalars.last?.value == 0x20E3, "#*0123456789".unicodeScalars.contains(first) { return value }
        if (0x1F1E6...0x1F1FF).contains(first.value) { return scalars.count == 2 ? value : nil }
        // ASCII digits, #, * and (c)/(r) carry the Emoji property but are not pictographs on their own.
        return first.properties.isEmoji && first.value > 0xFF ? value : nil
    }
}

/// A grid of common emojis plus a field for any single emoji. `selection` holds a valid emoji or nil.
struct StickerEmojiChooser: View {
    @Binding var selection: String?
    @State private var typed = ""
    @FocusState private var focused: Bool
    private let columns = [GridItem(.adaptive(minimum: 44), spacing: 4)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(StickerEmoji.common, id: \.self) { emoji in
                    Button {
                        selection = emoji
                        typed = ""
                        focused = false
                    } label: {
                        Text(emoji).font(.title2)
                            .frame(width: 44, height: 44)
                            .background(selection == emoji ? Color.accentColor.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Emoji \(emoji)")
                    .accessibilityAddTraits(selection == emoji ? .isSelected : [])
                }
            }
            TextField("Or type any emoji", text: $typed)
                .manrope()
                .focused($focused)
                .submitLabel(.done)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                .onChange(of: typed) { _, value in
                    if let valid = StickerEmoji.validated(value) { selection = valid }
                    else if !value.isEmpty { selection = nil }
                }
            if !typed.isEmpty && StickerEmoji.validated(typed) == nil {
                Text("Use exactly one emoji.").manrope(.caption).foregroundStyle(.red)
            }
        }
    }
}
