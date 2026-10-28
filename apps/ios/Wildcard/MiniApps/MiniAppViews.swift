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

/// Compact entry point under the contact's reply; opens the full mini app as a sheet.
struct MiniAppCardView: View {
    let app: MiniApp
    let contactID: String
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
            .padding(.horizontal, 12).padding(.vertical, 10)
            .frame(maxWidth: 340, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("\(app.title), mini app")
        .sheet(isPresented: $presented) { MiniAppScreen(contactID: contactID, appID: app.id) }
    }
}

struct MiniAppScreen: View {
    let contactID: String
    let appID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @State private var confirmDelete = false
    @State private var pendingAction: (id: String, label: String, confirm: String, local: Bool, fields: [String: MiniAppFieldValue])?
    @State private var confirming = false
    @State private var runningAction: String?
    /// An uncertain submission keeps its execution ID so a retry can never run twice.
    @State private var execution: (actionID: String, fields: [String: MiniAppFieldValue], id: UUID)?

    private var store: MiniAppStore { contacts.miniApps }
    private var app: MiniApp? { store.app(contactID: contactID, id: appID) }
    private var key: String { "\(contactID)/\(appID)" }

    var body: some View {
        NavigationStack {
            Group {
                if let app {
                    if app.isEnabled { enabled(app) } else { review(app) }
                } else if store.apps[contactID] == nil {
                    ProgressView()
                } else {
                    ContentUnavailableView("Mini app unavailable", systemImage: "square.dashed", description: Text(store.errors[contactID] ?? "It may have been deleted."))
                }
            }
            .navigationTitle(app?.title ?? "Mini app")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                if let app, app.isEnabled {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button { Task { await store.resolve(app, contactID: contactID, force: true, using: auth) } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                            Button { Task { await approve(app, allowed: false) } } label: { Label("Disable", systemImage: "pause.circle") }
                            Button(role: .destructive) { confirmDelete = true } label: { Label("Delete mini app", systemImage: "trash") }
                        } label: { Image(systemName: "ellipsis.circle") }
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
        }
        .task {
            await store.refresh(contactID: contactID, using: auth)
            if let app, app.isEnabled { await store.resolve(app, contactID: contactID, using: auth) }
        }
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

    private func enabled(_ app: MiniApp) -> some View {
        List {
            ForEach(app.inputs, id: \.id) { input in
                Section {
                    if input.type == "segmented", let options = input.options {
                        Picker(input.label, selection: Binding(
                            get: { store.inputs[key]?[input.id] ?? input.default },
                            set: { value in Task { await store.resolve(app, contactID: contactID, inputs: (store.inputs[key] ?? [:]).merging([input.id: value]) { $1 }, using: auth) } }
                        )) { ForEach(options, id: \.value) { Text($0.label).tag($0.value) } }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                    } else {
                        MiniAppTextInput(label: input.label, initial: store.inputs[key]?[input.id] ?? input.default, number: input.type == "number") { value in
                            Task { await store.resolve(app, contactID: contactID, inputs: (store.inputs[key] ?? [:]).merging([input.id: value]) { $1 }, using: auth) }
                        }
                    }
                }
            }
            if let notice { Section { Text(notice).manrope(.footnote).foregroundStyle(.secondary) } }
            if let message = error ?? store.viewErrors[key] {
                Section {
                    Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Button("Retry") { Task { await store.resolve(app, contactID: contactID, force: true, using: auth) } }
                }
            }
            if let view = store.views[key] {
                MiniAppRenderer(components: view.view, state: store.displayState(key: key), runningAction: runningAction) { id, local, label, confirm, fields in
                    if let confirm { pendingAction = (id, label, confirm, local, fields); confirming = true }
                    else { Task { await run(id, label: label, local: local, fields: fields) } }
                } onTap: { id, updates in
                    store.tap(app, contactID: contactID, actionID: id, updates: updates, using: auth)
                } onEdit: { update in
                    store.tap(app, contactID: contactID, actionID: nil, updates: [update], using: auth)
                }
                // Only connector data can be stale; saved state is always current.
                if view.remote == true {
                    Section { } footer: {
                        Text("Updated \(Date(timeIntervalSince1970: view.resolvedAt / 1000).formatted(date: .omitted, time: .shortened))")
                    }
                }
            } else if store.resolving.contains(key) {
                Section { HStack { Spacer(); ProgressView("Loading data…"); Spacer() } }.listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.resolve(app, contactID: contactID, force: true, using: auth) }
    }

    private func approve(_ app: MiniApp, allowed: Bool) async {
        guard !busy else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await store.approve(app, contactID: contactID, allowed: allowed, using: auth)
            if allowed, let updated = self.app, updated.isEnabled { await store.resolve(updated, contactID: contactID, force: true, using: auth) }
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }

    private func delete() async {
        guard let app else { return }
        do { try await store.delete(app, contactID: contactID, using: auth); dismiss() }
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
            let status = try await store.run(app, contactID: contactID, actionID: actionID, executionID: id, fields: fields, using: auth)
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
/// hero number, consecutive stats share one grid, and consecutive field-less actions
/// share one button row, matching the web renderer.
struct MiniAppRenderer: View {
    let components: [MiniAppComponent]
    let state: [String: MiniAppStateValue]
    let runningAction: String?
    let onAction: (String, Bool, String, String?, [String: MiniAppFieldValue]) -> Void
    let onTap: (String, [MiniAppUpdate]) -> Void
    /// Direct edits from components bound to state.
    let onEdit: (MiniAppUpdate) -> Void

    private enum Block: Identifiable {
        case stats(Int, [MiniAppComponent]), buttons(Int, [MiniAppComponent]), section(Int, String?, [MiniAppComponent]), single(Int, MiniAppComponent)
        var id: Int { switch self { case .stats(let i, _), .buttons(let i, _), .section(let i, _, _), .single(let i, _): i } }
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
                        case .section: EmptyView()
                        }
                    }
                } header: { if let title { Text(title) } }
            case .single(_, let component): Section { rows(component) }
            }
        }
    }

    private func buttonRow(_ actions: [MiniAppComponent]) -> some View {
        MiniAppButtonRow(actions: actions, runningAction: runningAction) { action in
            guard case .action(let id, let local, let label, let confirm, _, _, let updates) = action else { return }
            // Literal local taps apply instantly; anything else goes through the confirmed path.
            if local, confirm == nil, let updates { onTap(id, updates) } else { onAction(id, local, label, confirm, [:]) }
        }
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
                if points.isEmpty { Text("Nothing to chart.").foregroundStyle(.secondary) }
                else {
                    Chart(Array(points.enumerated()), id: \.offset) { _, point in
                        if kind == "line" {
                            LineMark(x: .value("Label", point.x), y: .value("Value", point.y)).interpolationMethod(.catmullRom)
                            PointMark(x: .value("Label", point.x), y: .value("Value", point.y))
                        } else {
                            BarMark(x: .value("Label", point.x), y: .value("Value", point.y)).cornerRadius(4)
                        }
                    }
                    .chartYAxis { AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel { if let number = value.as(Double.self) { Text(MiniAppFormat.text(.number(number), format: format, currency: currency, compact: true)) } }
                    } }
                    .frame(height: 200)
                    .accessibilityLabel(title ?? "Chart")
                }
            }
            .padding(.vertical, 6)
        case .text(let text, let style):
            Text(text).manrope(style == "headline" ? .headline : style == "caption" ? .footnote : .body, weight: style == "headline" ? .bold : .regular)
                .foregroundStyle(style == "caption" ? Color.secondary : Color.primary)
        case .action(let id, let local, let label, let confirm, let destructive, let fields, _):
            MiniAppActionForm(id: id, local: local, label: label, destructive: destructive, fields: fields, running: runningAction) { values in onAction(id, local, label, confirm, values) }
        case .notice(let code):
            Label(MiniAppFormat.issue(code), systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
        case .progress(let label, let value, let goal, let format, let currency, let caption, let stateID):
            let current = stateID.flatMap { id -> Double? in if case .number(let n)? = state[id] { n } else { nil } } ?? value ?? 0
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
        case .stat, .section, .unsupported: EmptyView()
        }
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

/// Contact details list of this person's mini apps for the contact.
struct MiniAppListView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var selected: MiniApp?

    var body: some View {
        let store = contacts.miniApps
        List {
            if let apps = store.apps[contactID], !apps.isEmpty {
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
                } footer: { Text("Mini apps use this contact’s connections and are visible only to you.") }
            }
            if let error = store.errors[contactID] { Section { Text(error).foregroundStyle(.red) } }
        }
        .overlay {
            if store.apps[contactID]?.isEmpty == true {
                ContentUnavailableView("No mini apps yet", systemImage: "square.grid.2x2",
                                       description: Text("Ask this contact in chat to build one from your connections, for example “Make me a mini app for last week’s expenses.”"))
            } else if store.apps[contactID] == nil && store.errors[contactID] == nil { ProgressView() }
        }
        .navigationTitle("Mini apps")
        .task { await store.refresh(contactID: contactID, using: auth, force: true) }
        .refreshable { await store.refresh(contactID: contactID, using: auth, force: true) }
        .sheet(item: $selected) { app in MiniAppScreen(contactID: contactID, appID: app.id) }
    }
}
