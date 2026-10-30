import Charts
import SwiftUI

/// Native layouts for the closed Home card catalog (docs/home.md#cards).
enum HomeStyle {
    static func accent(_ name: String) -> Color {
        ["blue": .blue, "green": .green, "orange": .orange, "red": .red, "purple": .purple,
         "teal": .teal, "pink": .pink, "indigo": .indigo, "gray": .gray][name] ?? .accentColor
    }
    static func symbol(_ icon: String) -> String {
        ["news": "newspaper.fill", "sport": "soccerball", "trophy": "trophy.fill", "chart": "chart.line.uptrend.xyaxis",
         "money": "banknote.fill", "globe": "globe.americas.fill", "calendar": "calendar", "clock": "clock.fill", "book": "book.fill",
         "heart": "heart.fill", "star": "star.fill", "bolt": "bolt.fill", "list": "list.bullet", "check": "checkmark.circle.fill",
         "person": "person.fill", "chat": "bubble.left.fill", "home": "house.fill", "folder": "folder.fill", "cart": "cart.fill",
         "plane": "airplane", "doc": "doc.text.fill", "weather": "cloud.sun.fill"][icon] ?? "sparkles"
    }
    static func trend(_ trend: String?) -> (symbol: String, color: Color)? {
        switch trend {
        case "up": ("arrow.up.right", .green)
        case "down": ("arrow.down.right", .red)
        case "flat": ("arrow.right", .secondary)
        default: nil
        }
    }
    static let corner: CGFloat = 26
}

enum HomeCardAction {
    case more, less, hide, message, reply(String)
}

/// Shared chrome: header with icon and contact, the kind's layout, then attribution and sources.
struct HomeCardView: View {
    let card: HomeCard
    var lead = false
    let act: (HomeCardAction) -> Void
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.openURL) private var openURL

    private var content: HomeCardContent { card.content }
    private var accent: Color { HomeStyle.accent(content.accent) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            layout
            footer
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous).fill(Color(.secondarySystemGroupedBackground))
                .overlay(alignment: .top) {
                    // The lead card carries a soft wash of its accent.
                    if lead {
                        LinearGradient(colors: [accent.opacity(0.18), .clear], startPoint: .top, endPoint: .center)
                            .clipShape(RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous))
                    }
                }
        }
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous))
        .contextMenu { menu }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: HomeStyle.symbol(content.icon))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 34, height: 34)
                .background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(content.title).manrope(lead ? .title3 : .headline, weight: .bold).fixedSize(horizontal: false, vertical: true)
                if let subtitle = content.subtitle {
                    Text(subtitle).manrope(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            Menu { menu } label: {
                Image(systemName: "ellipsis").font(.footnote.weight(.bold)).foregroundStyle(.secondary)
                    .frame(width: 30, height: 30).contentShape(Rectangle())
            }
            .accessibilityLabel("Card options")
        }
    }

    @ViewBuilder private var layout: some View {
        switch content.kind {
        case "headlines": HomeHeadlines(items: content.items ?? [], accent: accent, lead: lead)
        case "matches": HomeMatches(items: content.items ?? [], accent: accent)
        case "table": HomeTable(columns: content.columns ?? [], rows: content.rows ?? [], highlight: content.highlight, caption: content.caption, accent: accent)
        case "metrics": HomeMetrics(items: content.items ?? [])
        case "chart": HomeChart(content: content, accent: accent)
        case "tracker": HomeTracker(content: content, accent: accent)
        case "note": HomeNote(card: card, accent: accent, act: act)
        default: HomeList(items: content.items ?? [], accent: accent)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ContactAvatar(contact: card.contactID.flatMap { contacts.contact(id: $0) }, size: 18)
                Text(attribution).manrope(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            if !content.sources.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(content.sources, id: \.url) { source in
                            Button {
                                if let url = URL(string: source.url), MessageMarkdown.safeLink(url) { openURL(url) }
                            } label: {
                                Label(host(source.url), systemImage: "link").manrope(.caption2, weight: .semibold).lineLimit(1)
                                    .padding(.horizontal, 9).padding(.vertical, 5)
                                    .background(Color.primary.opacity(0.06), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Source: \(source.title)")
                        }
                    }
                }
                .scrollClipDisabled()
            }
        }
    }

    private var attribution: String {
        let when = Date(timeIntervalSince1970: card.generatedAt / 1000).formatted(.relative(presentation: .named))
        let reason = card.reason.map { " · \($0)" } ?? ""
        return "\(card.contactName ?? "A contact") · \(when)\(reason)"
    }

    private func host(_ value: String) -> String {
        URL(string: value)?.host()?.replacingOccurrences(of: "www.", with: "") ?? value
    }

    @ViewBuilder private var menu: some View {
        if let name = card.contactName, card.contactID != nil {
            Button { act(.message) } label: { Label("Message \(name)", systemImage: "bubble.left") }
        }
        Button { act(.more) } label: { Label("More like this", systemImage: card.feedback == "more" ? "hand.thumbsup.fill" : "hand.thumbsup") }
        Button { act(.less) } label: { Label("Less like this", systemImage: card.feedback == "less" ? "hand.thumbsdown.fill" : "hand.thumbsdown") }
        Button(role: .destructive) { act(.hide) } label: { Label("Hide from Home", systemImage: "eye.slash") }
    }
}

private struct HomeHeadlines: View {
    let items: [HomeCardContent.Item]
    let accent: Color
    let lead: Bool
    @Environment(AuthStore.self) private var auth
    @Environment(\.openURL) private var openURL
    @State private var image: UIImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let first = items.first {
                Button { open(first.url) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        if let image {
                            Image(uiImage: image).resizable().scaledToFill()
                                .frame(maxWidth: .infinity).frame(height: lead ? 190 : 150).clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        Text(first.title ?? "").manrope(lead ? .title2 : .title3, weight: .bold).multilineTextAlignment(.leading)
                        if let summary = first.summary { Text(summary).manrope(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.leading) }
                        meta(first)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .disabled(first.url == nil)
            }
            ForEach(Array(items.dropFirst().enumerated()), id: \.offset) { _, item in
                Divider()
                Button { open(item.url) } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Circle().fill(accent).frame(width: 6, height: 6).padding(.top, 7)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title ?? "").manrope(.subheadline, weight: .semibold).multilineTextAlignment(.leading)
                            meta(item)
                        }
                        Spacer(minLength: 0)
                        if item.url != nil { Image(systemName: "arrow.up.right").font(.caption2.weight(.bold)).foregroundStyle(.tertiary).padding(.top, 4) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(item.url == nil)
            }
        }
        .task(id: items.first?.url) {
            image = nil
            guard let url = items.first?.url,
                  let preview = await auth.images.linkPreviews.preview(for: url, using: auth),
                  preview.status == "ready", let version = preview.imageVersion else { return }
            image = try? await auth.cachedImage(.linkPreview(hash: preview.hash, version: Int(version)), maxPixelSize: 900)
        }
    }

    @ViewBuilder private func meta(_ item: HomeCardContent.Item) -> some View {
        let parts = [item.source, item.time].compactMap { $0 }
        if !parts.isEmpty { Text(parts.joined(separator: " · ")).manrope(.caption, weight: .semibold).foregroundStyle(.secondary) }
    }

    private func open(_ value: String?) {
        if let value, let url = URL(string: value), MessageMarkdown.safeLink(url) { openURL(url) }
    }
}

private struct HomeMatches: View {
    let items: [HomeCardContent.Item]
    let accent: Color

    var body: some View {
        VStack(spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, match in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            team(match.home ?? "", score: match.homeScore, wins: (match.homeScore ?? 0) > (match.awayScore ?? 0))
                            team(match.away ?? "", score: match.awayScore, wins: (match.awayScore ?? 0) > (match.homeScore ?? 0))
                        }
                        Text(match.status ?? "")
                            .manrope(.caption, weight: .bold).monospacedDigit()
                            .foregroundStyle(live(match) ? .white : accent)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(live(match) ? AnyShapeStyle(Color.red.gradient) : AnyShapeStyle(accent.opacity(0.14)), in: Capsule())
                            .fixedSize()
                    }
                    if let detail = match.detail { Text(detail).manrope(.caption).foregroundStyle(.secondary) }
                }
                .padding(12)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func team(_ name: String, score: Int?, wins: Bool) -> some View {
        HStack {
            Text(name).manrope(.subheadline, weight: wins ? .bold : .medium).lineLimit(1)
            Spacer(minLength: 8)
            if let score { Text("\(score)").manrope(.title3, weight: .bold).monospacedDigit().foregroundStyle(wins ? .primary : .secondary) }
        }
    }

    private func live(_ match: HomeCardContent.Item) -> Bool {
        let status = (match.status ?? "").lowercased()
        return status.contains("live") || status.contains("vivo") || status.contains("'")
    }
}

private struct HomeTable: View {
    let columns: [String]
    let rows: [[String]]
    let highlight: Int?
    let caption: String?
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(columns.enumerated()), id: \.offset) { index, column in
                        Text(column).manrope(.caption, weight: .bold).foregroundStyle(.secondary)
                            .gridColumnAlignment(index == 0 ? .leading : .trailing)
                    }
                }
                .padding(.vertical, 6)
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { column, cell in
                            Text(cell).manrope(.subheadline, weight: index == highlight ? .bold : (column == 0 ? .medium : .regular))
                                .monospacedDigit().lineLimit(1)
                        }
                    }
                    .padding(.vertical, 7)
                    .background(index == highlight ? accent.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            if let caption { Text(caption).manrope(.caption).foregroundStyle(.secondary) }
        }
    }
}

private struct HomeMetrics: View {
    let items: [HomeCardContent.Item]

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.label ?? "").manrope(.caption, weight: .semibold).foregroundStyle(.secondary).lineLimit(2)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(item.value ?? "").manrope(.title2, weight: .bold).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                        if let unit = item.unit { Text(unit).manrope(.caption, weight: .semibold).foregroundStyle(.secondary) }
                    }
                    if item.change != nil || HomeStyle.trend(item.trend) != nil {
                        HStack(spacing: 3) {
                            if let trend = HomeStyle.trend(item.trend) { Image(systemName: trend.symbol).font(.caption2.weight(.bold)) }
                            if let change = item.change { Text(change).manrope(.caption, weight: .bold).monospacedDigit() }
                        }
                        .foregroundStyle(HomeStyle.trend(item.trend)?.color ?? .secondary)
                    }
                    if let caption = item.caption { Text(caption).manrope(.caption2).foregroundStyle(.secondary).lineLimit(2) }
                }
                .padding(12)
                .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct HomeChart: View {
    let content: HomeCardContent
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if content.value != nil || content.change != nil {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if let value = content.value { Text(value).manrope(.largeTitle, weight: .bold).monospacedDigit() }
                    if let unit = content.unit { Text(unit).manrope(.subheadline, weight: .semibold).foregroundStyle(.secondary) }
                    if let change = content.change {
                        Label(change, systemImage: HomeStyle.trend(content.trend)?.symbol ?? "arrow.right")
                            .manrope(.subheadline, weight: .bold).foregroundStyle(HomeStyle.trend(content.trend)?.color ?? .secondary)
                    }
                }
            }
            let points = content.points ?? []
            Chart(Array(points.enumerated()), id: \.offset) { _, point in
                if content.style == "bar" {
                    BarMark(x: .value("Label", point.label), y: .value("Value", point.value))
                        .foregroundStyle(accent.gradient).cornerRadius(5)
                } else {
                    AreaMark(x: .value("Label", point.label), y: .value("Value", point.value))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(LinearGradient(colors: [accent.opacity(0.35), accent.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Label", point.label), y: .value("Value", point.value))
                        .interpolationMethod(.catmullRom).foregroundStyle(accent).lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                }
            }
            .chartYScale(domain: .automatic(includesZero: content.style == "bar"))
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { _ in AxisValueLabel() } }
            .frame(height: 170)
            .accessibilityLabel(content.title)
            if let summary = content.summary { Text(summary).manrope(.footnote).foregroundStyle(.secondary) }
        }
    }
}

private struct HomeTracker: View {
    let content: HomeCardContent
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(content.figure ?? "").manrope(.largeTitle, weight: .extraBold).foregroundStyle(accent).minimumScaleFactor(0.6).lineLimit(1)
                Text(content.figureLabel ?? "").manrope(.subheadline, weight: .medium).foregroundStyle(.secondary)
            }
            if let progress = content.progress {
                ProgressView(value: progress).tint(accent).scaleEffect(y: 1.6, anchor: .center)
                    .accessibilityLabel("Progress \(Int(progress * 100)) percent")
            }
            if let status = content.status { Text(status).manrope(.subheadline) }
            if let steps = content.steps, !steps.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 12) {
                            VStack(spacing: 0) {
                                Image(systemName: step.state == "done" ? "checkmark.circle.fill" : step.state == "current" ? "circle.inset.filled" : "circle")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(step.state == "upcoming" ? Color.secondary : accent)
                                    .symbolEffect(.pulse, isActive: step.state == "current")
                                if index < steps.count - 1 {
                                    Rectangle().fill(step.state == "done" ? accent.opacity(0.5) : Color.secondary.opacity(0.25)).frame(width: 2).frame(minHeight: 18)
                                }
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(step.label).manrope(.subheadline, weight: step.state == "current" ? .bold : .medium)
                                    .foregroundStyle(step.state == "upcoming" ? .secondary : .primary)
                                if let detail = step.detail { Text(detail).manrope(.caption).foregroundStyle(.secondary) }
                            }
                            .padding(.bottom, index < steps.count - 1 ? 10 : 0)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            if let note = content.note {
                Text(note).manrope(.footnote).foregroundStyle(.secondary)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}

private struct HomeNote: View {
    let card: HomeCard
    let accent: Color
    let act: (HomeCardAction) -> Void
    @Environment(ContactsStore.self) private var contacts

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                ContactAvatar(contact: card.contactID.flatMap { contacts.contact(id: $0) }, size: 34)
                Text(card.content.text ?? "").manrope(.body)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(accent.opacity(0.12), in: UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 20, bottomTrailingRadius: 20, topTrailingRadius: 20, style: .continuous))
            }
            if card.contactID != nil {
                Button { act(card.content.prompt.map { .reply($0) } ?? .message) } label: {
                    Label(card.content.prompt ?? "Reply", systemImage: "arrowshape.turn.up.left.fill")
                        .manrope(.subheadline, weight: .semibold).lineLimit(2).multilineTextAlignment(.leading)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(accent.opacity(0.25)).interactive(), in: Capsule())
                .padding(.leading, 44)
                .accessibilityHint("Opens the chat with this message ready to send")
            }
        }
    }
}

private struct HomeList: View {
    let items: [HomeCardContent.Item]
    let accent: Color
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 { Divider().padding(.leading, 26) }
                Button {
                    if let value = item.url, let url = URL(string: value), MessageMarkdown.safeLink(url) { openURL(url) }
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)").manrope(.caption, weight: .bold).foregroundStyle(accent).frame(width: 14).padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title ?? "").manrope(.subheadline, weight: .semibold).multilineTextAlignment(.leading)
                            if let detail = item.detail { Text(detail).manrope(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.leading) }
                        }
                        Spacer(minLength: 8)
                        if let trailing = item.trailing { Text(trailing).manrope(.caption, weight: .semibold).foregroundStyle(.secondary).multilineTextAlignment(.trailing) }
                    }
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(item.url == nil)
            }
        }
    }
}
