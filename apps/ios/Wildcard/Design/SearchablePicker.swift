import SwiftUI

/// A form picker that adds search to long option lists such as countries, languages and
/// accents. Up to `threshold` options it is a native `Picker`; longer lists open a sheet
/// with a searchable list, matching the web select's search field.
struct SearchablePicker: View {
    struct Option: Identifiable, Hashable {
        let value: String
        let label: String
        var id: String { value }
    }

    static let threshold = 10
    let title: String
    @Binding var selection: String
    let options: [Option]
    /// Shown when the selection matches no option, such as an unchosen country.
    var placeholder = "Choose"
    @Environment(\.isEnabled) private var isEnabled
    @State private var presented = false

    var body: some View {
        if options.count <= Self.threshold {
            Picker(title, selection: $selection) {
                if !options.contains(where: { $0.value == selection }) { Text(placeholder).tag(selection) }
                ForEach(options) { Text($0.label).tag($0.value) }
            }
        } else {
            Button { presented = true } label: {
                LabeledContent(title) {
                    HStack(spacing: 4) {
                        Text(options.first { $0.value == selection }?.label ?? placeholder)
                        Image(systemName: "chevron.up.chevron.down").imageScale(.small)
                    }
                    .foregroundStyle(isEnabled ? Color.accentColor : .secondary)
                }
                .foregroundStyle(Color(uiColor: .label))
            }
            .sheet(isPresented: $presented) {
                SearchablePickerSheet(title: title, selection: $selection, options: options)
            }
        }
    }
}

private struct SearchablePickerSheet: View {
    let title: String
    @Binding var selection: String
    let options: [SearchablePicker.Option]
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    /// Case- and accent-insensitive, so "peru" finds "Perú".
    private var visible: [SearchablePicker.Option] {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return options }
        return options.filter { $0.label.range(of: term, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
    }

    var body: some View {
        NavigationStack {
            List(visible) { option in
                Button {
                    selection = option.value
                    dismiss()
                } label: {
                    HStack {
                        Text(option.label).foregroundStyle(Color(uiColor: .label))
                        Spacer()
                        if option.value == selection {
                            Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                                .accessibilityLabel("Selected")
                        }
                    }
                    .contentShape(Rectangle())
                }
            }
            .overlay {
                if visible.isEmpty { ContentUnavailableView.search(text: query) }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
