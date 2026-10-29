import Charts
import SwiftUI

struct MiniAppGlyph: View {
    let app: MiniApp
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: app.symbol)
            .font(.system(size: size * 0.46, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color.accentColor.gradient, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Compact entry point in the reply that built it; opens the mini app full screen, like an app.
/// `base` is `contacts/<id>` (a private app) or `groups/<id>` (shared by the group).
struct MiniAppCardView: View {
    let app: MiniApp
    let base: String
    /// Inside the contact's message bubble instead of on its own.
    var embedded = false
    @State private var presented = false

    var body: some View {
        Button { presented = true } label: {
            HStack(spacing: 12) {
                MiniAppGlyph(app: app)
                VStack(alignment: .leading, spacing: 1) {
                    Text(app.title).manrope(.subheadline, weight: .bold).foregroundStyle(.primary).lineLimit(1)
                    Text(app.isEnabled ? (app.subtitle ?? "Mini app") : app.status == "needs_reapproval" ? "Review changes to continue" : "Review to enable")
                        .manrope(.footnote, weight: app.isEnabled ? .regular : .semibold)
                        .foregroundStyle(app.isEnabled ? Color.secondary : Color.orange).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, embedded ? 10 : 12).padding(.vertical, 10)
            .frame(minWidth: embedded ? 220 : nil, maxWidth: embedded ? 300 : 340, alignment: .leading)
            .background(embedded ? Color(.systemBackground).opacity(0.7) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: embedded ? 12 : 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: embedded ? nil : .infinity, alignment: .leading)
        .accessibilityLabel("\(app.title), mini app")
        .fullScreenCover(isPresented: $presented) { MiniAppScreen(base: base, appID: app.id) }
    }
}

/// A full-screen mini app: one navigation stack, or a native tab bar with one stack per tab.
/// Each stack has a close button and the app's ⋯ menu; a composer is pinned above the tab bar.
struct MiniAppScreen: View {
    let base: String
    let appID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @State private var confirmDelete = false
    @State private var pendingAction: (id: String, label: String, confirm: String, local: Bool, fields: [String: MiniAppFieldValue])?
    @State private var confirming = false
    @State private var runningAction: String?
    @State private var selectedTab = ""
    /// An uncertain submission keeps its execution ID so a retry can never run twice.
    @State private var execution: (actionID: String, fields: [String: MiniAppFieldValue], id: UUID)?

    private var store: MiniAppStore { MiniAppStore.store(for: base, contacts: contacts, groups: groups) }
    private var app: MiniApp? { store.app(base: base, id: appID) }
    private var key: String { "\(base)/\(appID)" }

    var body: some View {
        Group {
            if let app, app.isEnabled, let tabs = app.tabs, tabs.count > 1 {
                TabView(selection: Binding(get: { selectedTab.isEmpty ? tabs[0].id : selectedTab }, set: { selectedTab = $0 })) {
                    ForEach(tabs, id: \.id) { tab in
                        Tab(tab.title, systemImage: MiniApp.symbol(tab.icon), value: tab.id) {
                            NavigationStack {
                                enabled(app, components: store.views[key]?.tabs?.first { $0.id == tab.id }?.view, first: tab.id == tabs[0].id)
                                    .navigationTitle(tab.title)
                                    .toolbar { toolbar(app) }
                            }
                        }
                    }
                }
            } else {
                NavigationStack {
                    Group {
                        if let app {
                            if app.isEnabled { enabled(app, components: store.views[key]?.view, first: true) } else { review(app) }
                        } else if store.apps[base] == nil {
                            ProgressView()
                        } else {
                            ContentUnavailableView("Mini app unavailable", systemImage: "square.dashed", description: Text(store.errors[base] ?? "It may have been deleted."))
                        }
                    }
                    .navigationTitle(app?.title ?? "Mini app")
                    .navigationBarTitleDisplayMode(app?.isEnabled == true ? .large : .inline)
                    .toolbar { toolbar(app) }
                }
            }
        }
        .confirmationDialog("Delete \(app?.title ?? "mini app")?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
        } message: { Text("The contact can build it again later.") }
        .alert(pendingAction?.label ?? "", isPresented: $confirming, presenting: pendingAction) { action in
            Button("Cancel", role: .cancel) { }
            Button("Continue") { Task { await run(action.id, label: action.label, local: action.local, fields: action.fields) } }
        } message: { action in Text(action.confirm) }
        .task {
            await store.refresh(base: base, using: auth)
            if let app, app.isEnabled { await store.resolve(app, base: base, using: auth) }
        }
    }

    @ToolbarContentBuilder private func toolbar(_ app: MiniApp?) -> some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
        }
        if let app, app.isEnabled {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    // The app's own menu actions first, then management.
                    let actions = store.views[key]?.menu ?? []
                    if !actions.isEmpty {
                        Section {
                            ForEach(Array(actions.enumerated()), id: \.offset) { _, action in
                                if case .action(let id, _, let label, _, let destructive, _, _) = action {
                                    Button(role: destructive ? .destructive : nil) { perform(action, app: app) } label: { Text(label) }
                                        .disabled(runningAction == id)
                                }
                            }
                        }
                    }
                    Section {
                        Button { Task { await store.resolve(app, base: base, force: true, using: auth) } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                        Button { Task { await approve(app, allowed: false) } } label: { Label("Disable", systemImage: "pause.circle") }
                        Button(role: .destructive) { confirmDelete = true } label: { Label("Delete mini app", systemImage: "trash") }
                    }
                } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("More")
            }
        }
    }

    /// Literal local taps apply instantly; anything else goes through the confirmed path.
    private func perform(_ action: MiniAppComponent, app: MiniApp) {
        guard case .action(let id, let local, let label, let confirm, _, _, let updates) = action else { return }
        if local, confirm == nil, let updates { store.tap(app, base: base, actionID: id, updates: updates, using: auth) }
        else { request(id, local: local, label: label, confirm: confirm, fields: [:]) }
    }
    private func request(_ id: String, local: Bool, label: String, confirm: String?, fields: [String: MiniAppFieldValue]) {
        if let confirm { pendingAction = (id, label, confirm, local, fields); confirming = true }
        else { Task { await run(id, label: label, local: local, fields: fields) } }
    }
    /// A composer row that only appends shows at once; anything else waits for the server.
    private func submit(_ composer: MiniAppComposer, text: String, app: MiniApp) {
        let value: MiniAppFieldValue
        if composer.kind == "number" {
            guard let number = try? Double(text, format: .number) else { return }
            value = .number(number)
        } else { value = .text(String(text.prefix(500))) }
        let fields = [composer.field: value]
        if let append = composer.append, composer.confirm == nil, !composer.remote {
            var item = append.item
            if case .number(let number) = value { item[append.key] = .number(number) } else { item[append.key] = .text(String(text.prefix(500))) }
            store.tap(app, base: base, actionID: composer.action, updates: [MiniAppUpdate(state: append.state, op: "append", value: .list([item]))], fields: fields, using: auth)
        } else { request(composer.action, local: !composer.remote, label: composer.label, confirm: composer.confirm, fields: fields) }
    }

    private func review(_ app: MiniApp) -> some View {
        Form {
            Section {
                VStack(spacing: 10) {
                    MiniAppGlyph(app: app, size: 64)
                    Text(app.title).manrope(.title3, weight: .bold).multilineTextAlignment(.center)
                    if let subtitle = app.subtitle { Text(subtitle).manrope(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                }
                .frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } footer: {
                Text(app.status == "needs_reapproval" ? "A connection or tool changed since you enabled this mini app. Review it again to keep using it." : "Your contact built this mini app. Review what it can do before enabling it.")
            }
            Section("Runs each time you open or refresh") {
                let reads = app.tools.filter { $0.role == "read" }
                if reads.isEmpty { Text("No automatic reads.").foregroundStyle(.secondary) }
                ForEach(reads, id: \.self) { tool in toolRow(tool) }
            }
            let writes = app.tools.filter { $0.role == "write" }
            if !writes.isEmpty {
                Section("Only when you tap and confirm") { ForEach(writes, id: \.self) { tool in toolRow(tool) } }
            }
            Section {
                Button { Task { await approve(app, allowed: true) } } label: {
                    Text(busy ? "Enabling…" : "Enable mini app").frame(maxWidth: .infinity).manrope(.body, weight: .semibold)
                }
                .disabled(busy)
            } footer: {
                Text("These tools use your connection permissions, and the service decides what each one does. Data is loaded for you only; it is not sent to the contact or saved to memory. Editing the mini app requires review again.")
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section { Button("Delete mini app", role: .destructive) { confirmDelete = true } }
        }
    }

    private func toolRow(_ tool: MiniAppTool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tool.toolName).manrope(.body, weight: .semibold)
            Text(tool.connectionName).manrope(.footnote).foregroundStyle(.secondary)
        }
    }

    /// One screen of the app. Inputs and status show on the first screen only.
    private func enabled(_ app: MiniApp, components: [MiniAppComponent]?, first: Bool) -> some View {
        let composer = components?.lazy.compactMap { component -> MiniAppComposer? in if case .composer(let value) = component { value } else { nil } }.first
        return List {
            if first {
                ForEach(app.inputs, id: \.id) { input in
                    Section {
                        if input.type == "segmented", let options = input.options {
                            Picker(input.label, selection: Binding(
                                get: { store.inputs[key]?[input.id] ?? input.default },
                                set: { value in Task { await store.resolve(app, base: base, inputs: (store.inputs[key] ?? [:]).merging([input.id: value]) { $1 }, using: auth) } }
                            )) { ForEach(options, id: \.value) { Text($0.label).tag($0.value) } }
                            .pickerStyle(.segmented)
                            .listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                        } else {
                            MiniAppTextInput(label: input.label, initial: store.inputs[key]?[input.id] ?? input.default, number: input.type == "number") { value in
                                Task { await store.resolve(app, base: base, inputs: (store.inputs[key] ?? [:]).merging([input.id: value]) { $1 }, using: auth) }
                            }
                        }
                    }
                }
            }
            if let notice { Section { Text(notice).manrope(.footnote).foregroundStyle(.secondary) } }
            if let message = error ?? store.viewErrors[key] {
                Section {
                    Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Button("Retry") { Task { await store.resolve(app, base: base, force: true, using: auth) } }
                }
            }
            if let view = store.views[key], let components {
                MiniAppRenderer(components: components, state: store.displayState(key: key), runningAction: runningAction) { id, local, label, confirm, fields in
                    request(id, local: local, label: label, confirm: confirm, fields: fields)
                } onTap: { id, updates in
                    store.tap(app, base: base, actionID: id, updates: updates, using: auth)
                } onEdit: { update in
                    store.tap(app, base: base, actionID: nil, updates: [update], using: auth)
                } onSelectTab: { tab in selectedTab = tab }
                // Only connector data can be stale; saved state is always current.
                if view.remote == true && first {
                    Section { } footer: {
                        Text("Updated \(Date(timeIntervalSince1970: view.resolvedAt / 1000).formatted(date: .omitted, time: .shortened))")
                    }
                }
            } else if store.resolving.contains(key) {
                Section { HStack { Spacer(); ProgressView("Loading data…"); Spacer() } }.listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await store.resolve(app, base: base, force: true, using: auth) }
        .safeAreaInset(edge: .bottom) {
            if let composer { MiniAppComposerBar(composer: composer, running: runningAction == composer.action) { submit(composer, text: $0, app: app) } }
        }
    }

    private func approve(_ app: MiniApp, allowed: Bool) async {
        guard !busy else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await store.approve(app, base: base, allowed: allowed, using: auth)
            if allowed, let updated = self.app, updated.isEnabled { await store.resolve(updated, base: base, force: true, using: auth) }
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }

    private func delete() async {
        guard let app else { return }
        do { try await store.delete(app, base: base, using: auth); dismiss() }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }

    private func run(_ actionID: String, label: String, local: Bool, fields: [String: MiniAppFieldValue]) async {
        guard let app, runningAction == nil else { return }
        let id = execution.flatMap { $0.actionID == actionID && $0.fields == fields ? $0.id : nil } ?? UUID()
        execution = (actionID, fields, id)
        runningAction = actionID; notice = nil; error = nil
        defer { runningAction = nil }
        do {
            let status = try await store.run(app, base: base, actionID: actionID, executionID: id, fields: fields, using: auth)
            execution = nil
            // Local state changes show up in the view itself; only external writes report an outcome.
            guard !local else { return }
            notice = status == "completed" ? "\(label): done." : status == "failed" ? "\(label) failed. Nothing was confirmed by the service."
                : "\(label): the outcome is unknown. Check the service before trying again."
        } catch is CancellationError { }
        catch {
            if !AuthAPI.isTransient(error) { execution = nil }
            self.error = error.localizedDescription
        }
    }
}

/// A text bar pinned to the bottom of a screen, like a messaging app's composer.
struct MiniAppComposerBar: View {
    let composer: MiniAppComposer
    let running: Bool
    let submit: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func send() {
        guard !trimmed.isEmpty, !running else { return }
        submit(trimmed)
        text = ""
        focused = true
    }

    var body: some View {
        HStack(spacing: 8) {
            TextField(composer.placeholder ?? composer.label, text: $text)
                .keyboardType(composer.kind == "number" ? .decimalPad : .default)
                .submitLabel(.send)
                .focused($focused)
                .onSubmit(send)
                .padding(.horizontal, 16).frame(minHeight: 44)
                .glassEffect(.regular.interactive(), in: .capsule)
            Button(action: send) {
                Group { if running { ProgressView() } else { Image(systemName: "arrow.up").font(.body.weight(.bold)) } }.frame(width: 28, height: 28)
            }
            .buttonStyle(.glassProminent).buttonBorderShape(.circle)
            .disabled(trimmed.isEmpty || running)
            .accessibilityLabel(composer.label)
        }
        .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 8)
    }
}

/// A text or number field bound to saved state; saves when submitted.
private struct MiniAppStateInput: View {
    let label: String
    let placeholder: String?
    let number: Bool
    let value: String
    let save: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        LabeledContent(label) {
            TextField(placeholder ?? label, text: $text)
                .multilineTextAlignment(.trailing)
                .keyboardType(number ? .decimalPad : .default)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { if text != value { save(text) } }
        }
        .onAppear { text = value }
        .onChange(of: value) { _, updated in if !focused { text = updated } }
        .onChange(of: focused) { _, isFocused in if !isFocused, text != value { save(text) } }
    }
}

/// An on-device countdown; it is not saved and stops when the screen closes.
private struct MiniAppTimer: View {
    let label: String
    let duration: Int
    @State private var endsAt: Date?
    @State private var remaining: TimeInterval?

    private func left(at now: Date) -> TimeInterval { endsAt.map { max(0, $0.timeIntervalSince(now)) } ?? remaining ?? TimeInterval(duration) }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let seconds = Int(left(at: context.date).rounded(.up))
            VStack(spacing: 14) {
                Text(label).manrope(.headline, weight: .semibold).foregroundStyle(.secondary)
                Text(Duration.seconds(seconds).formatted(.time(pattern: seconds >= 3600 ? .hourMinuteSecond : .minuteSecond)))
                    .font(.system(size: 64, weight: .bold, design: .rounded)).monospacedDigit()
                    .contentTransition(.numericText(countsDown: true)).animation(.snappy, value: seconds)
                    .foregroundStyle(seconds == 0 ? Color.green : Color.primary)
                HStack(spacing: 12) {
                    if endsAt != nil {
                        Button { remaining = left(at: .now); endsAt = nil } label: { Text("Pause").manrope(.headline, weight: .semibold).frame(maxWidth: .infinity, minHeight: 50) }.buttonStyle(.glass)
                    } else {
                        Button { endsAt = .now.addingTimeInterval(seconds == 0 ? TimeInterval(duration) : left(at: .now)); remaining = nil } label: {
                            Text(remaining == nil || seconds == 0 ? "Start" : "Resume").manrope(.headline, weight: .semibold).frame(maxWidth: .infinity, minHeight: 50)
                        }.buttonStyle(.glassProminent)
                    }
                    Button { endsAt = nil; remaining = nil } label: { Text("Reset").manrope(.headline, weight: .semibold).frame(maxWidth: .infinity, minHeight: 50) }.buttonStyle(.glass)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .sensoryFeedback(.success, trigger: seconds == 0 && endsAt != nil)
        }
    }
}

private struct MiniAppTextInput: View {
    let label: String
    let initial: String
    var number = false
    let submit: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        LabeledContent(label) {
            TextField(label, text: $text)
                .multilineTextAlignment(.trailing)
                .keyboardType(number ? .decimalPad : .default)
                .focused($focused)
                .onSubmit { submit(String(text.prefix(200))) }
                .submitLabel(.done)
        }
        .onAppear { text = initial }
        // Decimal pads have no return key, so leaving the field applies the value too.
        .onChange(of: focused) { _, isFocused in if !isFocused, text != initial { submit(String(text.prefix(200))) } }
    }
}

/// Renders the server-resolved tree as native list sections. A lone stat becomes a
/// hero number, consecutive stats share one grid, consecutive field-less actions
/// share one button row and grids lay out cards side by side, matching the web renderer.
/// Composers are drawn by the screen, pinned to the bottom.
struct MiniAppRenderer: View {
    let components: [MiniAppComponent]
    let state: [String: MiniAppStateValue]
    let runningAction: String?
    let onAction: (String, Bool, String, String?, [String: MiniAppFieldValue]) -> Void
    let onTap: (String, [MiniAppUpdate]) -> Void
    /// Direct edits from components bound to state.
    let onEdit: (MiniAppUpdate) -> Void
    /// Tiles that open another tab of the app.
    var onSelectTab: (String) -> Void = { _ in }

    private enum Block: Identifiable {
        case stats(Int, [MiniAppComponent]), buttons(Int, [MiniAppComponent]), section(Int, String?, [MiniAppComponent]), grid(Int, Int, [MiniAppComponent]), single(Int, MiniAppComponent)
        var id: Int { switch self { case .stats(let i, _), .buttons(let i, _), .section(let i, _, _), .grid(let i, _, _), .single(let i, _): i } }
    }
    private static func blocks(_ components: [MiniAppComponent]) -> [Block] {
        var result: [Block] = []
        for (index, component) in components.enumerated() {
            switch component {
            case .stat:
                if case .stats(let i, let items) = result.last { result[result.count - 1] = .stats(i, items + [component]) } else { result.append(.stats(index, [component])) }
            case .action(_, _, _, _, _, let fields, _) where fields.isEmpty:
                if case .buttons(let i, let items) = result.last { result[result.count - 1] = .buttons(i, items + [component]) } else { result.append(.buttons(index, [component])) }
            case .section(let title, let children): result.append(.section(index, title, children))
            case .grid(let columns, let children): result.append(.grid(index, columns, children))
            case .composer: continue
            default: result.append(.single(index, component))
            }
        }
        return result
    }

    var body: some View {
        ForEach(Self.blocks(components)) { block in
            switch block {
            case .stats(_, let stats): Section { MiniAppStatGrid(stats: stats, state: state) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
            case .buttons(_, let actions): Section { buttonRow(actions) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
            case .section(_, let title, let children):
                Section {
                    ForEach(Array(Self.blocks(children).enumerated()), id: \.offset) { _, child in
                        switch child {
                        case .stats(_, let stats): MiniAppStatGrid(stats: stats, state: state).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                        case .buttons(_, let actions): buttonRow(actions).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                        case .single(_, let component): rows(component)
                        case .section, .grid: EmptyView()
                        }
                    }
                } header: { if let title { Text(title) } }
            case .grid(_, let columns, let children):
                Section { MiniAppGrid(columns: columns, children: children, state: state, runningAction: runningAction, press: press, selectTab: onSelectTab) }
                    .listRowBackground(Color.clear).listRowInsets(EdgeInsets())
            case .single(_, let component): Section { rows(component) }
            }
        }
    }

    /// Literal local taps apply instantly; anything else goes through the confirmed path.
    private func press(_ action: MiniAppComponent) {
        guard case .action(let id, let local, let label, let confirm, _, _, let updates) = action else { return }
        if local, confirm == nil, let updates { onTap(id, updates) } else { onAction(id, local, label, confirm, [:]) }
    }
    private func buttonRow(_ actions: [MiniAppComponent]) -> some View {
        MiniAppButtonRow(actions: actions, runningAction: runningAction, perform: press)
    }

    @ViewBuilder private func rows(_ component: MiniAppComponent) -> some View {
        switch component {
        case .list(let items, let format, let currency, let empty):
            if items.isEmpty { Text(empty).foregroundStyle(.secondary) }
            ForEach(Array(items.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.title).manrope(.body)
                        if let subtitle = row.subtitle { Text(subtitle).manrope(.footnote).foregroundStyle(.secondary) }
                    }
                    Spacer(minLength: 8)
                    if let value = row.value { Text(MiniAppFormat.text(value, format: format, currency: currency)).manrope(.body, weight: .semibold).monospacedDigit() }
                }
            }
        case .chart(let kind, let title, let points, let format, let currency):
            VStack(alignment: .leading, spacing: 8) {
                if let title { Text(title).manrope(.subheadline, weight: .semibold) }
                MiniAppChart(kind: kind, title: title, points: points, format: format, currency: currency, height: kind == "pie" ? 240 : 200)
            }
            .padding(.vertical, 6)
        case .tile(let tile):
            Button { if let tab = tile.tab { onSelectTab(tab) } else if let action = tile.action { press(action) } } label: {
                HStack(spacing: 12) {
                    Image(systemName: MiniApp.symbol(tile.icon)).font(.body.weight(.semibold)).foregroundStyle(.white)
                        .frame(width: 30, height: 30).background(Color.accentColor.gradient, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tile.title).manrope(.body).foregroundStyle(.primary)
                        if let caption = tile.caption { Text(caption).manrope(.footnote).foregroundStyle(.secondary) }
                    }
                    Spacer(minLength: 8)
                    if let value = MiniAppTileValue.shown(tile, state: state) { Text(value).manrope(.body, weight: .semibold).monospacedDigit().foregroundStyle(.secondary) }
                    if tile.tab != nil { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary) }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(tile.tab == nil && tile.action == nil)
        case .text(let text, let style):
            Text(text).manrope(style == "headline" ? .headline : style == "caption" ? .footnote : .body, weight: style == "headline" ? .bold : .regular)
                .foregroundStyle(style == "caption" ? Color.secondary : Color.primary)
        case .action(let id, let local, let label, let confirm, let destructive, let fields, _):
            MiniAppActionForm(id: id, local: local, label: label, destructive: destructive, fields: fields, running: runningAction) { values in onAction(id, local, label, confirm, values) }
        case .notice(let code):
            Label(MiniAppFormat.issue(code), systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
        case .progress(let label, let value, let goal, let format, let currency, let caption, let stateID, let ring):
            let current = stateID.flatMap { id -> Double? in if case .number(let n)? = state[id] { n } else { nil } } ?? value ?? 0
            if ring {
                VStack(spacing: 8) {
                    MiniAppRing(fraction: current / goal, text: MiniAppFormat.text(.number(current), format: format, currency: currency, compact: true), size: 120)
                    Text(label).manrope(.headline, weight: .semibold)
                    Text(caption ?? "of \(MiniAppFormat.text(.number(goal), format: format, currency: currency))").manrope(.footnote).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 8)
            } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(label).manrope(.body, weight: .semibold)
                    Spacer()
                    Text("\(MiniAppFormat.text(.number(current), format: format, currency: currency)) / \(MiniAppFormat.text(.number(goal), format: format, currency: currency))")
                        .manrope(.body, weight: .semibold).monospacedDigit().foregroundStyle(current >= goal ? Color.green : Color.secondary)
                        .contentTransition(.numericText()).animation(.snappy(duration: 0.25), value: current)
                }
                ProgressView(value: min(max(current / goal, 0), 1)).tint(current >= goal ? .green : .accentColor).animation(.snappy(duration: 0.3), value: current)
                if let caption { Text(caption).manrope(.footnote).foregroundStyle(.secondary) }
            }
            .padding(.vertical, 4)
            }
        case .checklist(let checklist):
            let rows = checklist.rows(from: state)
            if rows.isEmpty { Text(checklist.empty).foregroundStyle(.secondary) }
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                Button {
                    if let field = checklist.done { onEdit(MiniAppUpdate(state: checklist.state, op: "toggle_item", index: index, field: field)) }
                } label: {
                    HStack(spacing: 12) {
                        if let done = row.done {
                            Image(systemName: done ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(done ? Color.green : Color.secondary)
                                .contentTransition(.symbolEffect(.replace))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title).manrope(.body).strikethrough(row.done == true).foregroundStyle(row.done == true ? Color.secondary : Color.primary)
                            if let subtitle = row.subtitle { Text(subtitle).manrope(.footnote).foregroundStyle(.secondary) }
                        }
                        Spacer(minLength: 8)
                        if let value = row.value { Text(MiniAppFormat.text(value, format: checklist.format, currency: checklist.currency)).manrope(.body, weight: .semibold).monospacedDigit() }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(checklist.done == nil)
                .swipeActions {
                    if checklist.removable {
                        Button(role: .destructive) { onEdit(MiniAppUpdate(state: checklist.state, op: "remove_item", index: index)) } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            }
        case .toggle(let label, let stateID, let value):
            let isOn = state[stateID].map { $0 == .bool(true) } ?? value
            Toggle(label, isOn: Binding(get: { isOn }, set: { _ in onEdit(MiniAppUpdate(state: stateID, op: "toggle")) })).manrope(.body)
        case .choice(let label, let stateID, let value, let options):
            let selected = state[stateID]?.label ?? value
            VStack(alignment: .leading, spacing: 8) {
                Text(label).manrope(.subheadline, weight: .semibold).foregroundStyle(.secondary)
                Picker(label, selection: Binding(get: { selected }, set: { onEdit(MiniAppUpdate(state: stateID, op: "set", value: .text($0))) })) {
                    ForEach(options, id: \.value) { Text($0.label).tag($0.value) }
                }
                .pickerStyle(.segmented)
            }
            .padding(.vertical, 4)
        case .input(let label, let stateID, let value, let number, let placeholder):
            MiniAppStateInput(label: label, placeholder: placeholder, number: number, value: state[stateID]?.label ?? MiniAppStateValue.text({ if case .text(let t) = value { t } else if case .number(let n) = value { n.formatted(.number.grouping(.never)) } else { "" } }()).label) { text in
                if number { if let n = try? Double(text, format: .number) { onEdit(MiniAppUpdate(state: stateID, op: "set", value: .number(n))) } }
                else { onEdit(MiniAppUpdate(state: stateID, op: "set", value: .text(String(text.prefix(500))))) }
            }
        case .timer(let label, let seconds):
            MiniAppTimer(label: label, duration: seconds)
        case .lesson(let lesson):
            MiniAppLessonRow(lesson: lesson) { score in
                if let xp = lesson.xp, score > 0 { onEdit(MiniAppUpdate(state: xp, op: "increment", value: .number(Double(score)))) }
            }
        case .stat, .section, .grid, .composer, .unsupported: EmptyView()
        }
    }
}

/// A lesson card; Start opens the lesson full screen.
private struct MiniAppLessonRow: View {
    let lesson: MiniAppLesson
    let complete: (Int) -> Void
    @State private var playing = false

    var body: some View {
        Button { playing = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "graduationcap.fill").font(.title3.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 46, height: 46).background(Color.green.gradient, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(lesson.title).manrope(.body, weight: .bold).foregroundStyle(.primary)
                    Text("\(lesson.questions.count) questions").manrope(.footnote).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Text("Start").manrope(.subheadline, weight: .bold).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 8).background(Color.green, in: Capsule())
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fullScreenCover(isPresented: $playing) { MiniAppLessonView(lesson: lesson, complete: complete) }
    }
}

/// One question at a time: choose or type, Check, then feedback and Continue. A wrong
/// answer costs a heart; running out ends the lesson without a score.
struct MiniAppLessonView: View {
    let lesson: MiniAppLesson
    let complete: (Int) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var selected: Int?
    @State private var typed = ""
    @State private var result: Bool?
    @State private var hearts: Int
    @State private var correct = 0
    @State private var finished = false
    @State private var failed = false
    @FocusState private var typing: Bool

    init(lesson: MiniAppLesson, complete: @escaping (Int) -> Void) {
        self.lesson = lesson
        self.complete = complete
        _hearts = State(initialValue: lesson.hearts)
    }

    private var question: MiniAppLesson.Question { lesson.questions[index] }
    private var ready: Bool { question.options == nil ? !typed.trimmingCharacters(in: .whitespaces).isEmpty : selected != nil }
    /// Typed answers ignore case, accents, punctuation and extra spaces.
    static func normalized(_ text: String) -> String {
        let folded = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        let kept = String(String.UnicodeScalarView(folded.unicodeScalars.filter { !CharacterSet.punctuationCharacters.contains($0) && !CharacterSet.symbols.contains($0) }))
        return kept.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Button { dismiss() } label: { Image(systemName: "xmark").font(.title3.weight(.semibold)) }
                    .foregroundStyle(.secondary).accessibilityLabel("Close")
                ProgressView(value: Double(index + (result == nil ? 0 : 1)), total: Double(lesson.questions.count))
                    .tint(.green).animation(.snappy, value: index)
                Label("\(hearts)", systemImage: "heart.fill").labelStyle(.titleAndIcon).font(.headline).monospacedDigit().foregroundStyle(.red)
                    .contentTransition(.numericText()).animation(.snappy, value: hearts)
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            if finished || failed { summary } else { quiz }
        }
        .sensoryFeedback(trigger: result) { _, value in value == true ? .success : value == false ? .error : nil }
    }

    private var quiz: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(question.prompt).manrope(.title2, weight: .bold).fixedSize(horizontal: false, vertical: true)
                    if let options = question.options {
                        VStack(spacing: 10) {
                            ForEach(Array(options.enumerated()), id: \.offset) { offset, option in
                                let chosen = selected == offset, right = result != nil && offset == question.correct
                                Button { selected = offset } label: {
                                    Text(option).manrope(.body, weight: .semibold).foregroundStyle(.primary)
                                        .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                                        .background((right ? Color.green : chosen ? Color.accentColor : Color.clear).opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .strokeBorder(right ? Color.green : chosen ? (result == false ? Color.red : Color.accentColor) : Color.secondary.opacity(0.3), lineWidth: 2))
                                }
                                .buttonStyle(.plain)
                                .disabled(result != nil)
                            }
                        }
                    } else {
                        TextField("Type your answer", text: $typed, axis: .vertical)
                            .manrope(.body).lineLimit(1...3).focused($typing)
                            .padding(16).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .disabled(result != nil)
                            .onAppear { typing = true }
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            VStack(alignment: .leading, spacing: 12) {
                if let result {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: result ? "checkmark.circle.fill" : "xmark.circle.fill").font(.title2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(result ? "Correct!" : "Correct answer:").manrope(.headline, weight: .bold)
                            if !result { Text(question.options.map { $0[question.correct ?? 0] } ?? question.answers?.first ?? "").manrope(.body) }
                            if let explain = question.explain { Text(explain).manrope(.subheadline).foregroundStyle(.secondary) }
                        }
                    }
                    .foregroundStyle(result ? Color.green : Color.red)
                }
                Button { if result == nil { check() } else { advance() } } label: {
                    Text(result == nil ? "Check" : "Continue").manrope(.headline, weight: .bold).frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.glassProminent).tint(result == false ? .red : .green)
                .disabled(result == nil && !ready)
            }
            .padding(20)
            .background((result == true ? Color.green : result == false ? Color.red : Color.clear).opacity(0.1))
            .animation(.snappy, value: result)
        }
    }

    private var summary: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: failed ? "heart.slash.fill" : "trophy.fill").font(.system(size: 76)).foregroundStyle(failed ? Color.red : Color.yellow)
                .symbolEffect(.bounce, value: finished)
            Text(failed ? "Out of hearts" : "Lesson complete!").manrope(.title, weight: .extraBold)
            Text("\(correct) of \(lesson.questions.count) correct").manrope(.title3).foregroundStyle(.secondary)
            if !failed, lesson.xp != nil, correct > 0 { Text("+\(correct) XP").manrope(.title2, weight: .bold).foregroundStyle(.green) }
            Spacer()
            Button {
                if failed { restart() } else { complete(correct); dismiss() }
            } label: { Text(failed ? "Try again" : "Done").manrope(.headline, weight: .bold).frame(maxWidth: .infinity, minHeight: 50) }
            .buttonStyle(.glassProminent).tint(.green)
            if failed { Button("Close") { dismiss() }.manrope(.body, weight: .semibold) }
        }
        .padding(24)
    }

    private func check() {
        let right = question.options == nil
            ? (question.answers ?? []).contains { Self.normalized($0) == Self.normalized(typed) }
            : selected == question.correct
        result = right
        if right { correct += 1 } else { hearts = max(0, hearts - 1) }
    }
    private func advance() {
        if hearts == 0 { failed = true; return }
        if index + 1 < lesson.questions.count { index += 1; selected = nil; typed = ""; result = nil } else { finished = true }
    }
    private func restart() {
        index = 0; selected = nil; typed = ""; result = nil; hearts = lesson.hearts; correct = 0; finished = false; failed = false
    }
}

/// A circular gauge for progress toward a goal.
struct MiniAppRing: View {
    let fraction: Double
    let text: String
    var size: CGFloat = 96

    var body: some View {
        let clamped = min(max(fraction.isFinite ? fraction : 0, 0), 1), met = fraction >= 1
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.18), lineWidth: size * 0.1)
            Circle().trim(from: 0, to: clamped)
                .stroke(met ? Color.green : Color.accentColor, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.snappy(duration: 0.35), value: clamped)
            Text(text).font(.system(size: size * 0.2, weight: .bold, design: .rounded)).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.5).padding(size * 0.16)
                .contentTransition(.numericText()).animation(.snappy(duration: 0.25), value: text)
        }
        .frame(width: size, height: size)
    }
}

/// Bar, line, area and donut charts with Swift Charts.
struct MiniAppChart: View {
    let kind: String
    let title: String?
    let points: [MiniAppPoint]
    let format: String
    let currency: String?
    var height: CGFloat = 200

    var body: some View {
        if points.isEmpty { Text("Nothing to chart.").foregroundStyle(.secondary) }
        else if kind == "pie" {
            Chart(Array(points.enumerated()), id: \.offset) { _, point in
                SectorMark(angle: .value("Value", max(point.y, 0)), innerRadius: .ratio(0.58), angularInset: 1.5)
                    .cornerRadius(4)
                    .foregroundStyle(by: .value("Label", point.x))
            }
            .chartLegend(position: .bottom, alignment: .center)
            .frame(height: height)
            .accessibilityLabel(title ?? "Chart")
        } else {
            Chart(Array(points.enumerated()), id: \.offset) { _, point in
                switch kind {
                case "line":
                    LineMark(x: .value("Label", point.x), y: .value("Value", point.y)).interpolationMethod(.catmullRom)
                    PointMark(x: .value("Label", point.x), y: .value("Value", point.y))
                case "area":
                    AreaMark(x: .value("Label", point.x), y: .value("Value", point.y)).interpolationMethod(.catmullRom)
                        .foregroundStyle(LinearGradient(colors: [Color.accentColor.opacity(0.45), Color.accentColor.opacity(0.05)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Label", point.x), y: .value("Value", point.y)).interpolationMethod(.catmullRom)
                default:
                    BarMark(x: .value("Label", point.x), y: .value("Value", point.y)).cornerRadius(4)
                }
            }
            .chartYAxis { AxisMarks { value in
                AxisGridLine()
                AxisValueLabel { if let number = value.as(Double.self) { Text(MiniAppFormat.text(.number(number), format: format, currency: currency, compact: true)) } }
            } }
            .frame(height: height)
            .accessibilityLabel(title ?? "Chart")
        }
    }
}

enum MiniAppTileValue {
    /// Saved state (with pending taps) wins over the resolved value, as for stats.
    static func shown(_ tile: MiniAppTile, state: [String: MiniAppStateValue]) -> String? {
        (tile.state.flatMap { state[$0]?.scalar } ?? tile.value).map { MiniAppFormat.text($0, format: tile.format, currency: tile.currency) }
    }
}

/// Cards side by side: stats, rings, small charts, text, buttons and tiles.
private struct MiniAppGrid: View {
    let columns: Int
    let children: [MiniAppComponent]
    let state: [String: MiniAppStateValue]
    let runningAction: String?
    let press: (MiniAppComponent) -> Void
    let selectTab: (String) -> Void

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: max(columns, 1)), spacing: 10) {
            ForEach(Array(children.enumerated()), id: \.offset) { _, child in card(child) }
        }
    }

    @ViewBuilder private func card(_ child: MiniAppComponent) -> some View {
        switch child {
        case .action(let id, let local, let label, _, let destructive, _, _):
            Button(role: destructive ? .destructive : nil) { press(child) } label: {
                Group { if runningAction == id && !local { ProgressView() } else { Text(label).manrope(.headline, weight: .semibold).multilineTextAlignment(.center) } }
                    .frame(maxWidth: .infinity, minHeight: 64)
            }
            .buttonStyle(.glass).tint(destructive ? .red : nil)
            .disabled(runningAction != nil && !local)
        case .tile(let tile):
            Button { if let tab = tile.tab { selectTab(tab) } else if let action = tile.action { press(action) } } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: MiniApp.symbol(tile.icon)).font(.title3.weight(.semibold)).foregroundStyle(Color.accentColor)
                    Spacer(minLength: 4)
                    if let value = MiniAppTileValue.shown(tile, state: state) {
                        Text(value).manrope(.title2, weight: .extraBold).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(.primary)
                    }
                    Text(tile.title).manrope(.subheadline, weight: .semibold).foregroundStyle(.primary).lineLimit(2)
                    if let caption = tile.caption { Text(caption).manrope(.caption).foregroundStyle(.secondary).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
                .modifier(MiniAppCardStyle())
                .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(tile.tab == nil && tile.action == nil)
        case .stat(let label, let value, let format, let currency, let caption, let stateID):
            let shown = stateID.flatMap { state[$0]?.scalar } ?? value
            VStack(alignment: .leading, spacing: 2) {
                Text(label).manrope(.footnote, weight: .semibold).foregroundStyle(.secondary)
                Text(shown.map { MiniAppFormat.text($0, format: format, currency: currency) } ?? "—")
                    .manrope(.title, weight: .extraBold).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1)
                    .contentTransition(.numericText()).animation(.snappy(duration: 0.25), value: shown)
                if let caption { Text(caption).manrope(.caption).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .modifier(MiniAppCardStyle())
            .accessibilityElement(children: .combine)
        case .progress(let label, let value, let goal, let format, let currency, let caption, let stateID, let ring):
            let current = stateID.flatMap { id -> Double? in if case .number(let n)? = state[id] { n } else { nil } } ?? value ?? 0
            VStack(alignment: ring ? .center : .leading, spacing: 8) {
                if ring { MiniAppRing(fraction: current / goal, text: MiniAppFormat.text(.number(current), format: format, currency: currency, compact: true), size: 84) }
                Text(label).manrope(.subheadline, weight: .semibold).lineLimit(1)
                if !ring {
                    Text("\(MiniAppFormat.text(.number(current), format: format, currency: currency, compact: true)) / \(MiniAppFormat.text(.number(goal), format: format, currency: currency, compact: true))")
                        .manrope(.title3, weight: .bold).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                    ProgressView(value: min(max(current / goal, 0), 1)).tint(current >= goal ? .green : .accentColor)
                }
                if let caption { Text(caption).manrope(.caption).foregroundStyle(.secondary).lineLimit(2) }
            }
            .frame(maxWidth: .infinity, alignment: ring ? .center : .leading)
            .modifier(MiniAppCardStyle())
            .accessibilityElement(children: .combine)
        case .chart(let kind, let title, let points, let format, let currency):
            VStack(alignment: .leading, spacing: 6) {
                if let title { Text(title).manrope(.footnote, weight: .semibold).foregroundStyle(.secondary) }
                MiniAppChart(kind: kind, title: title, points: points, format: format, currency: currency, height: 120)
            }
            .modifier(MiniAppCardStyle())
        case .text(let text, let style):
            Text(text).manrope(style == "headline" ? .headline : style == "caption" ? .footnote : .subheadline, weight: style == "headline" ? .bold : .regular)
                .foregroundStyle(style == "caption" ? Color.secondary : Color.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .modifier(MiniAppCardStyle())
        case .notice(let code):
            Label(MiniAppFormat.issue(code), systemImage: "exclamationmark.triangle").manrope(.footnote).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading).modifier(MiniAppCardStyle())
        default: EmptyView()
        }
    }
}

private struct MiniAppCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(14).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct MiniAppStatGrid: View {
    let stats: [MiniAppComponent]
    let state: [String: MiniAppStateValue]

    private func display(_ value: MiniAppScalar?, _ stateID: String?) -> MiniAppScalar? {
        stateID.flatMap { state[$0]?.scalar } ?? value
    }

    var body: some View {
        if stats.count == 1, case .stat(let label, let value, let format, let currency, let caption, let stateID) = stats[0] {
            // A single stat is the app's main number: large, centered and animated.
            let shown = display(value, stateID)
            VStack(spacing: 4) {
                Text(label).manrope(.headline, weight: .semibold).foregroundStyle(.secondary)
                Text(shown.map { MiniAppFormat.text($0, format: format, currency: currency) } ?? "—")
                    .font(.system(size: 76, weight: .bold, design: .rounded)).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.4)
                    .contentTransition(.numericText(countsDown: false))
                    .animation(.snappy(duration: 0.25), value: shown)
                if let caption { Text(caption).manrope(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
            .accessibilityElement(children: .combine)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], spacing: 8) {
                ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                    if case .stat(let label, let value, let format, let currency, let caption, let stateID) = stat {
                        let shown = display(value, stateID)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(label).manrope(.footnote, weight: .semibold).foregroundStyle(.secondary)
                            Text(shown.map { MiniAppFormat.text($0, format: format, currency: currency) } ?? "—")
                                .manrope(.title, weight: .extraBold).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                                .contentTransition(.numericText()).animation(.snappy(duration: 0.25), value: shown)
                            if let caption { Text(caption).manrope(.caption).foregroundStyle(.secondary) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }
}

/// Field-less actions as large native buttons: short symbols (+, −) share one row,
/// longer labels stack below. The first non-destructive action is prominent.
private struct MiniAppButtonRow: View {
    let actions: [MiniAppComponent]
    let runningAction: String?
    let perform: (MiniAppComponent) -> Void
    @State private var taps = 0

    private struct Item: Identifiable { let id: String; let label: String; let destructive: Bool; let local: Bool; let component: MiniAppComponent }
    private var items: [Item] {
        actions.compactMap { component in
            guard case .action(let id, let local, let label, _, let destructive, _, _) = component else { return nil }
            return Item(id: id, label: label, destructive: destructive, local: local, component: component)
        }
    }
    /// The action that adds (+, increment, append) is prominent; otherwise the first non-destructive one.
    private var primaryID: String? {
        let adds = items.first { item in
            guard !item.destructive, case .action(_, _, _, _, _, _, let updates) = item.component else { return false }
            return item.label.hasPrefix("+") || (updates ?? []).contains { $0.op == "increment" || $0.op == "append" }
        }
        return (adds ?? items.first { !$0.destructive })?.id
    }

    var body: some View {
        let short = items.filter { $0.label.count <= 3 }, long = items.filter { $0.label.count > 3 }
        VStack(spacing: 12) {
            if !short.isEmpty { HStack(spacing: 12) { ForEach(short) { button($0, symbol: true) } } }
            ForEach(long) { button($0, symbol: false) }
        }
        .padding(.vertical, 4)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
    }

    @ViewBuilder private func button(_ item: Item, symbol: Bool) -> some View {
        let label = Group {
            if runningAction == item.id && !item.local { ProgressView() }
            else if symbol { Text(item.label == "-" ? "−" : item.label).font(.system(size: 34, weight: .semibold, design: .rounded)) }
            else { Text(item.label).manrope(.headline, weight: .semibold) }
        }
        .frame(maxWidth: .infinity, minHeight: symbol ? 64 : 50)
        let action = { taps += 1; perform(item.component) }
        let disabled = runningAction != nil && !item.local
        if item.id == primaryID {
            Button(action: action) { label }.buttonStyle(.glassProminent).disabled(disabled)
        } else {
            Button(role: item.destructive ? .destructive : nil, action: action) { label }.buttonStyle(.glass).tint(item.destructive ? .red : nil).disabled(disabled)
        }
    }
}

private struct MiniAppActionForm: View {
    let id: String
    let local: Bool
    let label: String
    let destructive: Bool
    let fields: [MiniAppField]
    let running: String?
    let submit: ([String: MiniAppFieldValue]) -> Void
    @State private var texts: [String: String] = [:]
    @State private var toggles: [String: Bool] = [:]
    @State private var dates: [String: Date] = [:]

    private var values: [String: MiniAppFieldValue]? {
        var result: [String: MiniAppFieldValue] = [:]
        for field in fields {
            switch field.kind {
            case "toggle": result[field.id] = .toggle(toggles[field.id] ?? false)
            case "date":
                if let date = dates[field.id] { result[field.id] = .text(date.formatted(.iso8601.year().month().day())) }
                else if field.required { return nil }
            default:
                let text = (texts[field.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if text.isEmpty { if field.required { return nil }; continue }
                if field.kind == "number" {
                    guard let number = try? Double(text, format: .number) else { return nil }
                    result[field.id] = .number(number)
                } else { result[field.id] = .text(String(text.prefix(500))) }
            }
        }
        return result
    }

    var body: some View {
        ForEach(fields, id: \.id) { field in
            switch field.kind {
            case "toggle": Toggle(field.label, isOn: Binding(get: { toggles[field.id] ?? false }, set: { toggles[field.id] = $0 }))
            case "date": DatePicker(field.label, selection: Binding(get: { dates[field.id] ?? .now }, set: { dates[field.id] = $0 }), displayedComponents: .date)
            default:
                LabeledContent(field.label) {
                    TextField(field.required ? "Required" : "Optional", text: Binding(get: { texts[field.id] ?? "" }, set: { texts[field.id] = $0 }))
                        .multilineTextAlignment(.trailing)
                        .keyboardType(field.kind == "number" ? .decimalPad : .default)
                }
            }
        }
        Button(role: destructive ? .destructive : nil) { if let values { submit(values) } } label: {
            HStack { Text(running == id && !local ? "Working…" : label).manrope(.body, weight: .semibold); if running == id && !local { Spacer(); ProgressView() } }
        }
        .disabled(running != nil || values == nil)
    }
}

enum MiniAppFormat {
    static func text(_ value: MiniAppScalar, format: String, currency: String?, compact: Bool = false) -> String {
        switch value {
        case .number(let number):
            if format == "currency", let currency {
                return compact ? number.formatted(.currency(code: currency).notation(.compactName)) : number.formatted(.currency(code: currency))
            }
            if format == "percent" { return number.formatted(.percent.precision(.fractionLength(0...1))) }
            return compact ? number.formatted(.number.notation(.compactName)) : number.formatted(.number.precision(.fractionLength(0...2)))
        case .text(let text):
            guard format == "date" || format == "datetime" else { return text }
            // Date-only values are calendar days, not instants: never shift them across time zones.
            if text.count == 10, let day = try? Date(text, strategy: .iso8601.year().month().day()) {
                var style = Date.FormatStyle(date: .abbreviated, time: .omitted); style.timeZone = TimeZone(identifier: "UTC")!
                return day.formatted(style)
            }
            if let date = try? Date(text, strategy: .iso8601) { return date.formatted(date: .abbreviated, time: format == "datetime" ? .shortened : .omitted) }
            return text
        }
    }
    static func issue(_ code: String) -> String {
        [
            "TOOL_ERROR": "The connected service returned an error.", "RESULT_NOT_JSON": "The connected service did not return structured data.",
            "TOOL_CHANGED": "A tool changed. Review this mini app again.", "INVALID_ARGUMENTS": "The request no longer matches the tool.",
            "AUTHORIZATION_REQUIRED": "Authorize the connection again in Connections.", "CONNECTION_UNAVAILABLE": "Couldn't reach the connected service.",
            "NOT_AUTHORIZED": "This tool is no longer allowed.", "PATH_NOT_FOUND": "This data wasn't in the result.", "NOT_A_LIST": "Expected a list of items.",
            "TOO_MANY_ITEMS": "Too many items to show.", "TOO_MANY_GROUPS": "Too many groups to show.", "RESULT_TOO_LARGE": "This result is too large to show.",
        ][code] ?? "Couldn't load this part."
    }
}

/// Contact or group details list of its mini apps.
struct MiniAppListView: View {
    let base: String
    private var isGroup: Bool { base.hasPrefix("groups/") }
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(GroupsStore.self) private var groups
    @State private var selected: MiniApp?

    var body: some View {
        let store = MiniAppStore.store(for: base, contacts: contacts, groups: groups)
        List {
            if let apps = store.apps[base], !apps.isEmpty {
                Section {
                    ForEach(apps) { app in
                        Button { selected = app } label: {
                            HStack(spacing: 12) {
                                MiniAppGlyph(app: app, size: 34)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(app.title).manrope(.body, weight: .semibold).foregroundStyle(.primary)
                                    Text(app.isEnabled ? (app.subtitle ?? "Enabled") : "Needs review").manrope(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                } footer: { Text(isGroup ? "Group mini apps are shared: every member sees and edits the same saved values. They cannot use connections." : "Mini apps use this contact’s connections and are visible only to you.") }
            }
            if let error = store.errors[base] { Section { Text(error).foregroundStyle(.red) } }
        }
        .overlay {
            if store.apps[base]?.isEmpty == true {
                ContentUnavailableView("No mini apps yet", systemImage: "square.grid.2x2",
                                       description: Text(isGroup ? "Ask a contact in this group to build one, for example “Make us a shared shopping list.”" : "Ask this contact in chat to build one from your connections, for example “Make me a mini app for last week’s expenses.”"))
            } else if store.apps[base] == nil && store.errors[base] == nil { ProgressView() }
        }
        .navigationTitle("Mini apps")
        .task { await store.refresh(base: base, using: auth, force: true) }
        .refreshable { await store.refresh(base: base, using: auth, force: true) }
        .fullScreenCover(item: $selected) { app in MiniAppScreen(base: base, appID: app.id) }
    }
}
