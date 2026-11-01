import Charts
import SwiftUI

/// Native layouts for the closed Updates card catalog (docs/updates.md#cards), attached to timeline posts.
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
    case more, less, hide, message, reply(String), thread, comment
}

/// One Updates post (docs/updates.md#posts), like a Threads or X post: the contact's avatar on a rail,
/// "name › topic · age", the contact's text, and the card of the closed catalog attached in a frame that
/// shows one headline, figure or line of each kind until "Show more" (the same counts as the web).
/// In a thread the attachments start expanded and a line joins each avatar to the next post.
struct HomePostView: View {
    let post: HomePost
    var threadCount = 0
    var inThread = false
    var chained = false
    let act: (HomeCardAction) -> Void
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.openURL) private var openURL
    @State private var expanded: Bool

    init(post: HomePost, threadCount: Int = 0, inThread: Bool = false, chained: Bool = false, act: @escaping (HomeCardAction) -> Void) {
        self.post = post
        self.threadCount = threadCount
        self.inThread = inThread
        self.chained = chained
        self.act = act
        _expanded = State(initialValue: inThread)
    }

    private var content: HomeCardContent { post.content }
    private var accent: Color { HomeStyle.accent(content.accent) }
    private var isNote: Bool { content.kind == "note" }
    private var name: String { post.contactName ?? "A contact" }

    // How much of each kind shows before "Show more".
    private static let collapsedCount: [String: Int] = ["matches": 2, "metrics": 3, "list": 3]
    private static let collapsedRows = 4
    private var items: [HomeCardContent.Item] { content.items ?? [] }
    private var shownItems: [HomeCardContent.Item] {
        guard !expanded, let cap = Self.collapsedCount[content.kind] else { return items }
        return Array(items.prefix(cap))
    }
    private func keptRow(_ index: Int) -> Bool { index < Self.collapsedRows || index == content.highlight }
    private var hidden: Int {
        switch content.kind {
        case "headlines": return max(0, items.count - 1)
        case "table": return (content.rows ?? []).indices.filter { !keptRow($0) }.count
        default: return Self.collapsedCount[content.kind].map { max(0, items.count - $0) } ?? 0
        }
    }
    private var extras: Bool {
        switch content.kind {
        case "chart": content.summary != nil
        case "tracker": !(content.steps ?? []).isEmpty || content.note != nil
        default: false
        }
    }
    private var expandable: Bool { hidden > 0 || extras || post.reason != nil || !content.sources.isEmpty }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 6) {
                ContactAvatar(contact: post.contactID.flatMap { contacts.contact(id: $0) }, size: 36)
                if chained { Capsule().fill(Color.secondary.opacity(0.3)).frame(width: 2).frame(maxHeight: .infinity) }
            }
            .padding(.top, 12)
            VStack(alignment: .leading, spacing: 6) {
                header
                if let reply = post.replyTo {
                    Text("Replying to \(reply.contactName ?? "a contact")").manrope(.caption).foregroundStyle(.secondary)
                }
                if let text = post.text {
                    Text(text).manrope(.body).fixedSize(horizontal: false, vertical: true)
                        .contentShape(Rectangle())
                        .onTapGesture { if !inThread { act(.thread) } }
                }
                if isNote {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(content.text ?? "").manrope(.body).fixedSize(horizontal: false, vertical: true)
                        if post.contactID != nil, let prompt = content.prompt {
                            HomeReplyTemplate(prompt: prompt, accent: accent) { act(.reply($0)) }
                        }
                        more
                    }
                } else {
                    attachment
                }
                actions
            }
            .padding(.top, 12).padding(.bottom, 4)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .contextMenu { menu }
    }

    private var header: some View {
        HStack(spacing: 4) {
            Text(name).manrope(.subheadline, weight: .bold).lineLimit(1).layoutPriority(1)
            if !inThread {
                Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.secondary).accessibilityHidden(true)
                Text(content.title).manrope(.subheadline, weight: .semibold).lineLimit(1)
            }
            Text(Self.age(post.createdAt)).manrope(.subheadline).foregroundStyle(.secondary).fixedSize().padding(.leading, 2)
            Spacer(minLength: 0)
            Menu { menu } label: {
                Image(systemName: "ellipsis").font(.footnote.weight(.bold)).foregroundStyle(.secondary)
                    .frame(width: 28, height: 24).contentShape(Rectangle())
            }
            .accessibilityLabel("Post options")
        }
        .contentShape(Rectangle())
        .onTapGesture { if !inThread { act(.thread) } }
    }

    /// The card, framed like a quoted post or a link preview.
    private var attachment: some View {
        VStack(alignment: .leading, spacing: 10) {
            if content.subtitle != nil || post.text == nil {
                Label {
                    Text(post.text == nil ? (content.subtitle ?? content.title) : (content.subtitle ?? "")).lineLimit(1)
                } icon: {
                    Image(systemName: HomeStyle.symbol(content.icon)).foregroundStyle(accent)
                }
                .manrope(.caption, weight: .semibold).foregroundStyle(.secondary)
            }
            layout
            more
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.secondary.opacity(0.25)))
        .padding(.top, 2)
    }

    @ViewBuilder private var layout: some View {
        switch content.kind {
        case "headlines": HomeHeadlines(items: expanded ? items : Array(items.prefix(1)), accent: accent, lead: false)
        case "matches": HomeMatches(items: shownItems, accent: accent)
        case "table":
            let kept = (content.rows ?? []).indices.filter { expanded || keptRow($0) }
            HomeTable(columns: content.columns ?? [], rows: kept.map { (content.rows ?? [])[$0] },
                      highlight: content.highlight.flatMap { kept.firstIndex(of: $0) }, caption: expanded ? content.caption : nil, accent: accent)
        case "metrics": HomeMetrics(items: shownItems)
        case "chart": HomeChart(content: content, accent: accent, expanded: expanded)
        case "tracker": HomeTracker(content: content, accent: accent, expanded: expanded)
        default: HomeList(items: shownItems, accent: accent)
        }
    }

    /// Reason and sources once expanded, then the "Show more" toggle.
    @ViewBuilder private var more: some View {
        if expanded, post.reason != nil || !content.sources.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                if let reason = post.reason { Text(reason).manrope(.caption).foregroundStyle(.secondary) }
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
        if expandable {
            Button(expanded ? "Show less" : hidden > 0 ? "Show \(hidden) more" : "Show more") {
                withAnimation(.snappy) { expanded.toggle() }
            }
            .manrope(.subheadline, weight: .semibold)
            .buttonStyle(.plain)
            .foregroundStyle(.tint)
        }
    }

    private var actions: some View {
        HStack(spacing: 20) {
            Button { act(.more) } label: {
                Image(systemName: post.feedback == "more" ? "heart.fill" : "heart")
                    .foregroundStyle(post.feedback == "more" ? AnyShapeStyle(Color.pink) : AnyShapeStyle(.secondary))
            }
            .accessibilityLabel(post.feedback == "more" ? "Undo more like this" : "More like this")
            if post.contactID != nil {
                Button { act(.comment) } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left")
                        if let count = post.comments?.count, count > 0 { Text("\(count)").manrope(.footnote, weight: .semibold).monospacedDigit() }
                    }
                    .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Comment on \(name)’s post")
            }
            Spacer(minLength: 0)
            if !inThread && threadCount > 1 {
                Button("\(threadCount) posts in this thread") { act(.thread) }
                    .manrope(.footnote, weight: .semibold).foregroundStyle(.secondary)
            }
        }
        .font(.system(size: 17))
        .buttonStyle(.plain)
        .padding(.vertical, 6)
    }

    @ViewBuilder private var menu: some View {
        if let contactName = post.contactName, post.contactID != nil {
            Button { act(.message) } label: { Label("Message \(contactName)", systemImage: "bubble.left") }
        }
        Button { act(.less) } label: {
            Label(post.feedback == "less" ? "Undo less like this" : "Less like this", systemImage: post.feedback == "less" ? "hand.thumbsdown.fill" : "hand.thumbsdown")
        }
        Button(role: .destructive) { act(.hide) } label: { Label("Hide from Updates", systemImage: "eye.slash") }
    }

    private func host(_ value: String) -> String {
        URL(string: value)?.host()?.replacingOccurrences(of: "www.", with: "") ?? value
    }

    /// Compact, like a timeline: "now", "27m", "2h", "3d", then the date.
    static func age(_ at: Double) -> String {
        let minutes = max(0, Int((Date.now.timeIntervalSince1970 * 1000 - at) / 60_000))
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes)m" }
        if minutes < 60 * 24 { return "\(Int((Double(minutes) / 60).rounded()))h" }
        if minutes < 60 * 24 * 7 { return "\(Int((Double(minutes) / 1440).rounded()))d" }
        return Date(timeIntervalSince1970: at / 1000).formatted(.dateTime.month(.abbreviated).day())
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
    var expanded = true

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
            .frame(height: expanded ? 170 : 96)
            .accessibilityLabel(content.title)
            if expanded, let summary = content.summary { Text(summary).manrope(.footnote).foregroundStyle(.secondary) }
        }
    }
}

private struct HomeTracker: View {
    let content: HomeCardContent
    let accent: Color
    var expanded = true

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
            if expanded, let steps = content.steps, !steps.isEmpty {
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
            if expanded, let note = content.note {
                Text(note).manrope(.footnote).foregroundStyle(.secondary)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}

/// A note's suggested reply. Plain text is one wrapping button. A template with blanks (runs of
/// underscores) shows the sentence with its blanks marked and one field per blank; the completed
/// text goes to the chat's composer and is never sent from here.
private struct HomeReplyTemplate: View {
    let prompt: String
    let accent: Color
    let use: (String) -> Void
    @State private var values: [String] = []
    @FocusState private var focus: Int?

    private struct Segment { let text: String; let blank: Int? }

    private var segments: [Segment] {
        var result: [Segment] = []
        var current = ""
        var blank = 0
        var index = prompt.startIndex
        while index < prompt.endIndex {
            guard prompt[index] == "_" else { current.append(prompt[index]); index = prompt.index(after: index); continue }
            var end = index
            while end < prompt.endIndex, prompt[end] == "_" { end = prompt.index(after: end) }
            if prompt.distance(from: index, to: end) >= 2 {
                if !current.isEmpty { result.append(Segment(text: current, blank: nil)); current = "" }
                result.append(Segment(text: String(prompt[index..<end]), blank: blank)); blank += 1
            } else { current.append(contentsOf: prompt[index..<end]) }
            index = end
        }
        if !current.isEmpty { result.append(Segment(text: current, blank: nil)) }
        return result
    }
    private var blankCount: Int { segments.filter { $0.blank != nil }.count }
    private func value(_ blank: Int) -> String { values.indices.contains(blank) ? values[blank].trimmingCharacters(in: .whitespacesAndNewlines) : "" }
    private var complete: Bool { blankCount > 0 && (0..<blankCount).allSatisfy { !value($0).isEmpty } }
    private var completed: String { segments.map { $0.blank.map(value) ?? $0.text }.joined() }

    /// The sentence with each blank shown as its value, or a marked gap while empty.
    private var preview: AttributedString {
        var result = AttributedString()
        for segment in segments {
            guard let blank = segment.blank else { result += AttributedString(segment.text); continue }
            var part = AttributedString(value(blank).isEmpty ? "\u{2002}\u{2002}\u{2002}\u{2002}" : value(blank))
            part.foregroundColor = accent
            part.underlineStyle = .single
            result += part
        }
        return result
    }

    /// The few words before a blank, so each field says what it is for.
    private func hint(_ blank: Int) -> String {
        guard let position = segments.firstIndex(where: { $0.blank == blank }), position > 0, segments[position - 1].blank == nil else { return "Blank \(blank + 1)" }
        let words = segments[position - 1].text.split(separator: " ").suffix(3).joined(separator: " ")
        return words.isEmpty ? "Blank \(blank + 1)" : "\(words) …"
    }

    private func submit(_ blank: Int) {
        if blank + 1 < blankCount { focus = blank + 1 } else if complete { use(completed) }
    }

    var body: some View {
        if blankCount == 0 {
            Button { use(prompt) } label: {
                Label(prompt, systemImage: "arrowshape.turn.up.left.fill")
                    .manrope(.subheadline, weight: .semibold).lineLimit(3).multilineTextAlignment(.leading)
                    .padding(.horizontal, 14).padding(.vertical, 10)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.tint(accent.opacity(0.25)).interactive(), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .accessibilityHint("Opens the chat with this message ready to send")
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text(preview).manrope(.subheadline).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 8) {
                    ForEach(0..<blankCount, id: \.self) { blank in
                        TextField(hint(blank), text: binding(blank))
                            .manrope(.subheadline)
                            .focused($focus, equals: blank)
                            .submitLabel(blank + 1 < blankCount ? .next : .done)
                            .onSubmit { submit(blank) }
                            .padding(.horizontal, 12).padding(.vertical, 10)
                            .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                Button { use(completed) } label: {
                    Label("Continue in chat", systemImage: "arrowshape.turn.up.left.fill")
                        .manrope(.subheadline, weight: .semibold)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(accent.opacity(0.25)).interactive(), in: Capsule())
                .disabled(!complete).opacity(complete ? 1 : 0.5)
                .accessibilityHint("Opens the chat with this message ready to send")
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .onAppear { reset() }
            .onChange(of: prompt) { reset() }
        }
    }

    private func reset() { values = Array(repeating: "", count: blankCount) }
    private func binding(_ blank: Int) -> Binding<String> {
        Binding(get: { values.indices.contains(blank) ? values[blank] : "" },
                set: { if values.indices.contains(blank) { values[blank] = $0 } })
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
