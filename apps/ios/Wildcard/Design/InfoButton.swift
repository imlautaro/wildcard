import SwiftUI

/// Explains a setting on demand instead of a footer paragraph, like InfoButton on web.
/// Borderless, so placing it inside a toggle or row does not make the whole row tappable.
struct InfoButton: View {
    let title: String
    let text: String
    @State private var presented = false

    var body: some View {
        Button { presented = true } label: {
            Image(systemName: "info.circle").foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("About \(title)")
        .popover(isPresented: $presented) {
            // Long explanations, such as a tool's input schema, scroll inside the popover.
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title).manrope(.headline, weight: .semibold)
                    Text(text).manrope(.subheadline).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(idealWidth: 320, maxWidth: 360, maxHeight: 420)
            .presentationCompactAdaptation(.popover)
        }
    }
}

/// A form row that opens a sheet: leading icon, title, current value and a chevron.
struct SheetRow: View {
    let title: String
    let systemImage: String
    let value: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Label(title, systemImage: systemImage)
                Spacer(minLength: 8)
                Text(value).foregroundStyle(.secondary).lineLimit(1)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .foregroundStyle(Color(uiColor: .label))
    }
}
