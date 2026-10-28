import SwiftUI

/// Parses locally; message source remains unchanged in the conversation store.
struct MessageMarkdown {
    struct Block: Identifiable {
        let id: Int
        var text: AttributedString
        let intents: [PresentationIntent.IntentType]

        var headingLevel: Int? {
            for intent in intents {
                if case .header(let level) = intent.kind { return level }
            }
            return nil
        }
        var isCode: Bool { intents.contains { if case .codeBlock = $0.kind { return true }; return false } }
        var isQuote: Bool { intents.contains { $0.kind == .blockQuote } }
        var isRule: Bool { intents.contains { $0.kind == .thematicBreak } }
        var listDepth: Int { intents.filter { $0.kind == .orderedList || $0.kind == .unorderedList }.count }
        var listItemID: Int? {
            intents.first { if case .listItem = $0.kind { return true }; return false }?.identity
        }
        var tableID: Int? {
            intents.first { if case .table = $0.kind { return true }; return false }?.identity
        }
        var tableRowID: Int? {
            intents.first {
                if case .tableRow = $0.kind { return true }
                return $0.kind == .tableHeaderRow
            }?.identity
        }
        var isTableHeader: Bool { intents.contains { $0.kind == .tableHeaderRow } }
        var marker: String? {
            guard let ordinal = intents.compactMap({ intent -> Int? in
                if case .listItem(let ordinal) = intent.kind { return ordinal }
                return nil
            }).first else { return nil }
            let ordered = intents.first { $0.kind == .orderedList || $0.kind == .unorderedList }?.kind == .orderedList
            return ordered ? "\(ordinal)." : "•"
        }
    }

    let blocks: [Block]
    var inlineText: AttributedString? {
        guard blocks.count == 1, let block = blocks.first,
              block.headingLevel == nil, !block.isCode, !block.isQuote,
              !block.isRule, block.listDepth == 0, block.tableID == nil else { return nil }
        return block.text
    }

    init(_ source: String) {
        guard let parsed = try? AttributedString(markdown: source, options: .init(
            allowsExtendedAttributes: false, interpretedSyntax: .full, failurePolicy: .returnPartiallyParsedIfPossible
        )), !parsed.characters.isEmpty else {
            blocks = [Block(id: 0, text: AttributedString(source), intents: [])]
            return
        }
        var result: [Block] = []
        for run in parsed.runs {
            let intents = run.presentationIntent?.components ?? []
            let id = intents.first?.identity ?? 0
            var span = AttributedString(parsed[run.range])
            // SwiftUI renders inline attributes; block layout is handled below.
            span.presentationIntent = nil
            if let url = run.link, !Self.safeLink(url) { span.link = nil }
            if result.last?.id == id {
                result[result.count - 1].text.append(span)
            } else {
                result.append(Block(id: id, text: span, intents: intents))
            }
        }
        blocks = result
    }

    static func plainText(_ source: String) -> String {
        MessageMarkdown(source).blocks.map { String($0.text.characters) }
            .joined(separator: " ").split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// Resolve emphasis explicitly: Manrope has a variable weight axis and no italic face.
    static func styled(_ source: AttributedString, size: CGFloat, weight: AppTypography.Weight = .regular) -> AttributedString {
        var result = source
        for run in source.runs {
            let intent = run.inlinePresentationIntent ?? []
            let bold = intent.contains(.stronglyEmphasized)
            var font = intent.contains(.code)
                ? UIFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
                : AppTypography.font(size: size, weight: bold ? .bold : weight)
            if intent.contains(.emphasized) {
                font = UIFont(descriptor: font.fontDescriptor.withMatrix(
                    CGAffineTransform(a: 1, b: 0, c: 0.2, d: 1, tx: 0, ty: 0)
                ), size: size)
            }
            result[run.range].font = Font(font)
            if intent.contains(.code) { result[run.range].backgroundColor = Color.primary.opacity(0.07) }
            if intent.contains(.strikethrough) { result[run.range].strikethroughStyle = .single }
            result[run.range].inlinePresentationIntent = nil
        }
        return result
    }

    static func safeLink(_ url: URL) -> Bool {
        ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "")
    }
}

struct MessageMarkdownView: View {
    let markdown: MessageMarkdown
    @ScaledMetric(relativeTo: .body) private var bodySize: CGFloat = 17
    @ScaledMetric(relativeTo: .title3) private var headingSize: CGFloat = 20

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(markdown.blocks.enumerated()), id: \.offset) { index, block in
                if let tableID = block.tableID {
                    if index == 0 || markdown.blocks[index - 1].tableID != tableID {
                        tableContent(tableID)
                    }
                } else {
                    HStack(alignment: .top, spacing: 8) {
                        if block.isQuote { Rectangle().fill(.secondary.opacity(0.4)).frame(width: 3) }
                        if let marker = block.marker {
                            let previous = index > 0 ? markdown.blocks[index - 1].listItemID : nil
                            Text(previous == block.listItemID ? "" : marker)
                                .manrope().frame(minWidth: 22, alignment: .trailing)
                                .accessibilityHidden(previous == block.listItemID)
                        }
                        blockContent(block)
                    }
                    .padding(.leading, CGFloat(max(0, block.listDepth - 1)) * 16)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .textSelection(.enabled)
        .multilineTextAlignment(.leading)
        .environment(\.openURL, OpenURLAction { url in
            MessageMarkdown.safeLink(url) ? .systemAction : .discarded
        })
    }

    private func tableContent(_ tableID: Int) -> some View {
        let cells = markdown.blocks.filter { $0.tableID == tableID }
        let rowIDs = cells.compactMap(\.tableRowID).reduce(into: [Int]()) { rows, id in
            if rows.last != id { rows.append(id) }
        }
        return ScrollView(.horizontal) {
            Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(rowIDs, id: \.self) { rowID in
                    GridRow {
                        ForEach(cells.filter { $0.tableRowID == rowID }) { cell in
                            Text(MessageMarkdown.styled(cell.text, size: bodySize, weight: cell.isTableHeader ? .bold : .regular))
                                .padding(6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .overlay(Rectangle().stroke(.secondary.opacity(0.25), lineWidth: 0.5))
                        }
                    }
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }

    @ViewBuilder private func blockContent(_ block: MessageMarkdown.Block) -> some View {
        if block.isRule {
            Divider().padding(.vertical, 4)
        } else if block.isCode {
            // Wrap long code lines so a bubble never widens beyond the conversation.
            Text(String(block.text.characters)).font(.system(.callout, design: .monospaced))
                .padding(10).background(.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
        } else if let level = block.headingLevel {
            Text(MessageMarkdown.styled(block.text, size: level == 1 ? headingSize : bodySize, weight: .bold))
                .accessibilityAddTraits(.isHeader)
        } else {
            Text(MessageMarkdown.styled(block.text, size: bodySize))
        }
    }
}
