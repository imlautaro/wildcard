import SwiftUI

/// Shared to-do lists of one chat (see docs/tasks.md).
struct TaskMember: Decodable, Hashable, Sendable, Identifiable {
    let kind: String
    let id: String
    let name: String
    var key: String { "\(kind):\(id)" }
}

struct TaskItem: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let listID: String
    let title: String
    let notes: String?
    let status: String
    let assigneeKind: String?
    let assigneeID: String?
    let assigneeName: String?
    let result: String?
    let version: Int
    let blockedBy: [String]
    let blocked: Bool
    let workState: String?
    let nextStep: String?
    let evidence: String?
    let blockedReason: String?
    let workUsed: Int?
    let workLimit: Int?
    let researchQuery: String?
    let researchUsed: Int?
    let researchLimit: Int?
    let researchStatus: String?
    var researchDetail: String {
        let labels = ["pending": String(localized: "Pending or uncertain"), "ready": String(localized: "Draft saved"), "stopped": String(localized: "Stopped before publication"), "complete": String(localized: "Report saved"), "failed": String(localized: "Failed")]
        let used = researchUsed ?? 0, limit = researchLimit ?? 1
        guard let researchStatus else { return String(localized: "\(used)/\(limit) web research attempts used") }
        let status = labels[researchStatus] ?? researchStatus
        return String(localized: "\(used)/\(limit) web research attempts used · \(status)")
    }
    let monitorURL: String?
    let monitorKeywords: String?
    let monitorInterval: Int?
    let monitorTurnsUsed: Int?
    let monitorTurnLimit: Int?
    let monitorPending: Bool?
    let monitorChecks: [TaskMonitorCheck]?
    let documentID: String?
    let documentTitle: String?
    let reviewRounds: Int?
    let reviewRoundLimit: Int?
    let reviewFeedback: String?
    var reviewDetail: String? {
        guard let rounds = reviewRounds, rounds > 0 else { return nil }
        let limit = reviewRoundLimit ?? 2
        if !isFinished, let reviewFeedback { return String(localized: "Revision round \(rounds)/\(limit): \(reviewFeedback)") }
        return String(localized: "Revision round \(rounds)/\(limit)")
    }
    static let monitorIntervals = [(60, String(localized: "Every hour")), (360, String(localized: "Every 6 hours")), (1440, String(localized: "Every day"))]
    var monitorDetail: String {
        let interval = Self.monitorIntervals.first { $0.0 == (monitorInterval ?? 360) }?.1.lowercased() ?? ""
        let last = monitorChecks?.first.map { String(localized: "Last: \($0.label)") } ?? (monitorURL == nil ? "" : String(localized: "Not checked yet"))
        return [monitorURL == nil ? String(localized: "Page monitor removed") : String(localized: "Page monitor · \(interval)"),
                String(localized: "\(monitorTurnsUsed ?? 0)/\(monitorTurnLimit ?? 20) change turns used"),
                monitorPending == true ? String(localized: "Change waiting for a turn") : "", last].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    var workLabel: String? {
        if workState == "paused" { return String(localized: "Paused") }
        if workState == "blocked" { return String(localized: "Blocked") }
        if let workUsed, let workLimit, workUsed >= workLimit { return String(localized: "Budget exhausted") }
        return nil
    }
    var assigneeKey: String { assigneeKind.map { "\($0):\(assigneeID ?? "")" } ?? "" }
    var isFinished: Bool { status == "done" || status == "canceled" }
    /// Its blockers all finished, so a contact can start it.
    var isReady: Bool { status == "open" && !blockedBy.isEmpty && !blocked }
    /// A reviewer sent it back with feedback and it is not finished yet.
    var isReturned: Bool { (reviewRounds ?? 0) > 0 && reviewFeedback != nil && !isFinished }
}

struct TaskMonitorCheck: Decodable, Hashable, Sendable {
    let checkedAt: Double
    let outcome: String
    let errorCode: String?
    let httpStatus: Int?
    var label: String {
        let labels = ["baseline": String(localized: "First check saved"), "unchanged": String(localized: "Unchanged"), "repeated": String(localized: "Earlier version again"),
                      "ignored": String(localized: "Changed, no keyword match"), "changed": String(localized: "Relevant change"), "failed": String(localized: "Check failed")]
        let error = errorCode.map { " (\($0)\(httpStatus.map { " \($0)" } ?? ""))" } ?? ""
        let date = Date(timeIntervalSince1970: checkedAt / 1000).formatted(date: .numeric, time: .shortened)
        return "\(labels[outcome] ?? outcome)\(error) · \(date)"
    }
}

struct TaskListValue: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let title: String
    let status: String
    let tasks: [TaskItem]
    var isActive: Bool { status == "active" }
}

struct TaskBoard: Decodable, Sendable {
    let lists: [TaskListValue]
    let members: [TaskMember]
}

enum TaskStatusOption: String, CaseIterable, Identifiable {
    case open, in_progress, done, canceled
    var id: String { rawValue }
    var label: String {
        switch self {
        case .open: String(localized: "To do")
        case .in_progress: String(localized: "In progress")
        case .done: String(localized: "Done")
        case .canceled: String(localized: "Canceled")
        }
    }
}

extension AuthAPI {
    /// `base` is `contacts/:id` or `groups/:id`. Every mutation returns the whole board.
    func taskBoard(base: String, path: String = "", method: String = "GET", input: [String: Any]? = nil, token: String) async throws -> TaskBoard {
        let body = try input.map { try JSONSerialization.data(withJSONObject: $0) }
        let (data, _) = try await send(path: "\(base)/tasks\(path)", method: method, body: body, token: token)
        return try JSONDecoder().decode(TaskBoard.self, from: data)
    }
}

/// Session-cached task board with five-second revalidation while visible, because
/// contacts change tasks during their own turns. Edits replace the cached board.
/// One list shows at a time, as sections In progress, To do and Done; cards glide
/// between sections when a poll or an edit changes them and briefly outline in green
/// (done), orange (sent back) or the accent color (started or unblocked).
struct TasksView: View {
    let base: String
    let snapshot: NavigationSnapshot<TaskBoard>
    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var busy = false
    @State private var error: String?
    @State private var newList = ""
    @State private var drafts: [String: String] = [:]
    @State private var editing: TaskItem?
    @State private var cancelling: TaskListValue?
    @State private var selectedListID: String?
    @State private var showCanceled = false
    @State private var highlights: [String: Color] = [:]
    @State private var traces: [String: TaskTrace] = [:]
    @Namespace private var cards

    private var lists: [TaskListValue] { snapshot.value?.lists ?? [] }
    /// The person's pick, else the first active list, else the first one.
    private var current: TaskListValue? { lists.first { $0.id == selectedListID } ?? lists.first(where: \.isActive) ?? lists.first }
    private func tasks(_ status: String) -> [TaskItem] { current?.tasks.filter { $0.status == status } ?? [] }
    /// Changes whenever a card moves or changes, so poll updates animate.
    private var signature: [String] {
        guard let current else { return [] }
        return [current.id] + current.tasks.map { "\($0.id):\($0.status):\($0.version):\($0.blocked)" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
                if snapshot.value == nil && busy { ProgressView("Loading…").frame(maxWidth: .infinity) }
                if let list = current {
                    progress
                    section("in_progress", title: String(localized: "In progress"), list: list)
                    section("open", title: String(localized: "To do"), list: list)
                    section("done", title: String(localized: "task.board.done", defaultValue: "Done", comment: "Task board section for finished tasks"), list: list)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .animation(reduceMotion ? nil : .spring(duration: 0.5, bounce: 0.15), value: signature)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Tasks")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let list = current, list.isActive {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Cancel list", role: .destructive) { cancelling = list }
                    } label: { Image(systemName: "ellipsis.circle") }
                        .accessibilityLabel("List actions")
                }
            }
        }
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
        .onChange(of: signature) { noteChanges() }
        .sheet(item: $editing) { task in
            if let board = snapshot.value, let list = board.lists.first(where: { $0.id == task.listID }) {
                TaskEditorView(task: task, list: list, members: board.members, selfID: auth.user?.id) { patch in
                    await mutate("/items/\(task.id)", method: "PATCH", input: patch.merging(["version": task.version]) { $1 })
                }
            }
        }
        .confirmationDialog("Cancel this list?", isPresented: Binding(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } }), presenting: cancelling) { list in
            Button("Cancel list", role: .destructive) { Task { await mutate("/lists/\(list.id)", method: "PATCH", input: ["status": "canceled"]) } }
        } message: { list in
            Text("“\(list.title)” and every unfinished task in it are canceled. Contacts stop working on them.")
        }
    }

    @ViewBuilder private var header: some View {
        if !lists.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(lists) { list in
                        let selected = list.id == current?.id
                        Button { selectedListID = list.id } label: {
                            Text(list.isActive ? list.title : "\(list.title) · \(String(localized: "Canceled"))")
                                .manrope(.subheadline, weight: .semibold)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .foregroundStyle(selected ? Color.accentColor : .secondary)
                                .background(selected ? Color.accentColor.opacity(0.15) : .clear, in: Capsule())
                                .overlay { if !selected { Capsule().strokeBorder(Color(uiColor: .separator)) } }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
        }
        HStack {
            TextField("New list", text: $newList).onSubmit { createList() }
            Button("Create") { createList() }
                .disabled(busy || newList.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        if lists.isEmpty && snapshot.value != nil {
            Text("Lists keep shared work in this chat. Contacts can create them, take tasks, wait for blockers, and report results. You can also ask in the chat, for example “Split the trip planning into tasks.”")
                .manrope(.footnote).foregroundStyle(.secondary)
        }
    }

    private var progress: some View {
        let open = tasks("open").count, doing = tasks("in_progress").count, done = tasks("done").count
        let total = open + doing + done
        let segments = [(open, Color(uiColor: .systemGray4)), (doing, Color.accentColor), (done, Color.green)].filter { $0.0 > 0 }
        return VStack(alignment: .leading, spacing: 10) {
            Text(total == 0 ? String(localized: "No tasks yet") : String(localized: "\(done) of \(total) done"))
                .manrope(.title3, weight: .bold).monospacedDigit()
            GeometryReader { geometry in
                let width = geometry.size.width - CGFloat(max(segments.count - 1, 0)) * 3
                HStack(spacing: 3) {
                    ForEach(segments.indices, id: \.self) { index in
                        Capsule().fill(segments[index].1).frame(width: total == 0 ? 0 : width * CGFloat(segments[index].0) / CGFloat(total))
                    }
                }
            }
            .frame(height: 8)
            .accessibilityHidden(true)
            HStack(spacing: 14) {
                legend(String(localized: "\(open) to do"), color: Color(uiColor: .systemGray4))
                legend(String(localized: "\(doing) in progress"), color: .accentColor)
                legend(String(localized: "\(done) done"), color: .green)
            }
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func legend(_ text: String, color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(text).manrope(.caption).foregroundStyle(.secondary).monospacedDigit()
        }
    }

    private func section(_ status: String, title: String, list: TaskListValue) -> some View {
        let items = tasks(status)
        let canceled = status == "done" ? tasks("canceled") : []
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(title).manrope(.subheadline, weight: .bold).foregroundStyle(.secondary)
                Text("\(items.count)").manrope(.caption, weight: .semibold).monospacedDigit()
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Color(uiColor: .tertiarySystemFill), in: Capsule())
            }
            .padding(.horizontal, 4)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if items.isEmpty {
                Text("Nothing here").manrope(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(uiColor: .separator), style: StrokeStyle(lineWidth: 1, dash: [4, 3])) }
            }
            ForEach(items) { task in card(task, in: list) }
            if status == "open" && list.isActive {
                HStack {
                    TextField("Add a task", text: Binding(get: { drafts[list.id] ?? "" }, set: { drafts[list.id] = $0 }))
                        .onSubmit { addTask(to: list) }
                    Button("Add") { addTask(to: list) }
                        .disabled(busy || (drafts[list.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if !canceled.isEmpty {
                Button { showCanceled.toggle() } label: {
                    Label("Canceled (\(canceled.count))", systemImage: showCanceled ? "chevron.down" : "chevron.right")
                        .manrope(.subheadline, weight: .semibold).foregroundStyle(.secondary)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityValue(showCanceled ? String(localized: "Expanded") : String(localized: "Collapsed"))
                if showCanceled { ForEach(canceled) { task in card(task, in: list) } }
            }
        }
    }

    private func card(_ task: TaskItem, in list: TaskListValue) -> some View {
        TaskCardView(task: task, list: list, busy: busy, highlight: highlights[task.id]) {
            Task { await mutate("/items/\(task.id)", method: "PATCH", input: ["version": task.version, "status": task.status == "done" ? "open" : "done"]) }
        } edit: {
            if list.isActive { editing = task }
        } cancel: {
            Task { await mutate("/items/\(task.id)", method: "PATCH", input: ["version": task.version, "status": "canceled"]) }
        }
        .matchedGeometryEffect(id: task.id, in: cards)
    }

    /// Outlines cards that just reached a new state; the first load and list switches only record.
    private func noteChanges() {
        guard let list = current else { traces = [:]; return }
        let now = Dictionary(uniqueKeysWithValues: list.tasks.map { ($0.id, TaskTrace($0)) })
        for (id, trace) in now {
            guard let was = traces[id] else { continue }
            let color: Color? = trace.status == "done" && was.status != "done" ? .green
                : trace.review > was.review ? .orange
                : (trace.status == "in_progress" && was.status != "in_progress") || (trace.ready && !was.ready) ? .accentColor : nil
            guard let color else { continue }
            highlights[id] = color
            Task {
                try? await Task.sleep(for: .seconds(1.6))
                withAnimation(.easeOut(duration: 0.6)) { if highlights[id] == color { highlights[id] = nil } }
            }
        }
        traces = now
    }

    private func createList() {
        let title = newList.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let id = UUID().uuidString.lowercased()
        Task {
            if await mutate("/lists", method: "POST", input: ["id": id, "title": title, "tasks": [Any]()]) {
                newList = ""
                selectedListID = id
            }
        }
    }

    private func addTask(to list: TaskListValue) {
        let title = (drafts[list.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        Task {
            if await mutate("/lists/\(list.id)/tasks", method: "POST", input: ["id": UUID().uuidString.lowercased(), "title": title]) { drafts[list.id] = "" }
        }
    }

    private func refresh() async {
        guard !busy else { return }
        do {
            try await snapshot.refresh {
                try await auth.withSession { api, token in try await api.taskBoard(base: base, token: token) }
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound { error = String(localized: "These tasks are no longer available.") }
        catch {
            // Keep the cached board visible through transient failures.
            if snapshot.value == nil { self.error = error.localizedDescription }
        }
    }

    @discardableResult
    private func mutate(_ path: String, method: String, input: [String: Any]) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        snapshot.invalidate()
        do {
            try await snapshot.refresh {
                try await auth.withSession { api, token in try await api.taskBoard(base: base, path: path, method: method, input: input, token: token) }
            }
            error = nil
            return true
        } catch is CancellationError { return false }
        catch {
            self.error = error.localizedDescription
            busy = false
            await refresh()
            return false
        }
    }
}

/// What a card's highlight compares between two versions of the board.
private struct TaskTrace: Equatable {
    let status: String
    let ready: Bool
    let review: Int
    init(_ task: TaskItem) { status = task.status; ready = task.isReady; review = task.reviewRounds ?? 0 }
}

/// One task on the board. Rendering only: TasksView owns the editor and mutations.
private struct TaskCardView: View {
    let task: TaskItem
    let list: TaskListValue
    let busy: Bool
    let highlight: Color?
    let toggle: () -> Void
    let edit: () -> Void
    let cancel: () -> Void

    private var isAgent: Bool { task.assigneeKind == "agent" }
    private var workLabel: String? { isAgent && !task.isFinished ? task.workLabel : nil }
    private var working: Bool { isAgent && task.status == "in_progress" && task.workLabel == nil }
    private var waiting: [String] {
        guard task.blocked else { return [] }
        return task.blockedBy.compactMap { id in list.tasks.first { $0.id == id && !$0.isFinished }?.title }
    }
    private var icon: String { task.status == "done" ? "checkmark.circle.fill" : task.status == "canceled" ? "nosign" : task.blocked ? "clock" : "circle" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Button(action: toggle) {
                    Image(systemName: icon).font(.title3)
                        .foregroundStyle(task.status == "done" ? Color.green : Color.accentColor)
                }
                .buttonStyle(.plain)
                .disabled(busy || !list.isActive || task.status == "canceled")
                .accessibilityLabel(task.status == "done" ? "Mark \(task.title) not done" : "Mark \(task.title) done")
                Button(action: edit) {
                    Text(task.title).manrope(.body, weight: .semibold)
                        .strikethrough(task.status == "canceled")
                        .foregroundStyle(task.isFinished ? .secondary : .primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 8) {
                if task.isReturned, let review = task.reviewDetail { note(review, systemImage: "arrow.uturn.backward", tint: .orange) }
                if !waiting.isEmpty { note(String(localized: "Waiting for \(waiting.formatted(.list(type: .and)))"), systemImage: "clock", tint: nil) }
                if task.isReady { note(String(localized: "Ready to start"), systemImage: "checkmark", tint: .accentColor) }
                if let reason = task.blockedReason, !task.isFinished { note(String(localized: "Blocked: \(reason)"), systemImage: "exclamationmark.circle", tint: .orange) }
                if let next = task.nextStep, !task.isFinished { Text("Next step: \(next)").manrope(.caption).foregroundStyle(.secondary) }
                if let result = task.result {
                    Text(result).manrope(.footnote)
                        .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                if task.documentID != nil { Text("Deliverable: \(task.documentTitle ?? String(localized: "a document"))").manrope(.caption).foregroundStyle(.secondary) }
                meta
                if isAgent && !task.isFinished, let used = task.workUsed, let limit = task.workLimit {
                    Text("\(used)/\(limit) work turns used").manrope(.caption2).foregroundStyle(.secondary)
                }
                if working { TaskWorkingBar() }
            }
            .padding(.leading, 34)
        }
        .padding(12)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(highlight ?? .clear, lineWidth: 2) }
        .contextMenu {
            if list.isActive && !task.isFinished { Button("Cancel task", systemImage: "nosign", role: .destructive, action: cancel) }
        }
    }

    private var meta: some View {
        HStack(spacing: 6) {
            if let name = task.assigneeName {
                Text(Self.initials(name)).font(.system(size: 9, weight: .bold))
                    .frame(width: 20, height: 20)
                    .background(Color(uiColor: .tertiarySystemFill), in: Circle())
                    .accessibilityHidden(true)
            }
            Text(task.assigneeName ?? String(localized: "Unassigned")).manrope(.caption).foregroundStyle(.secondary).lineLimit(1)
            if working {
                Label("Working", systemImage: "circle.fill").labelStyle(.titleAndIcon)
                    .manrope(.caption2, weight: .semibold).imageScale(.small)
                    .foregroundStyle(Color.accentColor)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.accentColor.opacity(0.15), in: Capsule())
            } else if let workLabel {
                Text(workLabel).manrope(.caption2, weight: .semibold).foregroundStyle(.secondary)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color(uiColor: .tertiarySystemFill), in: Capsule())
            }
            if !task.isReturned, let review = task.reviewDetail {
                Text(review).manrope(.caption2, weight: .semibold).foregroundStyle(.secondary).lineLimit(1)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color(uiColor: .tertiarySystemFill), in: Capsule())
            }
        }
    }

    private func note(_ text: String, systemImage: String, tint: Color?) -> some View {
        Label(text, systemImage: systemImage)
            .manrope(.caption, weight: .semibold)
            .foregroundStyle(tint ?? .secondary)
            .padding(.horizontal, 8).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((tint ?? Color(uiColor: .label)).opacity(tint == nil ? 0.06 : 0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private static func initials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

/// Indeterminate progress line under a card whose contact is working on it.
private struct TaskWorkingBar: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var moving = false

    var body: some View {
        GeometryReader { geometry in
            Capsule().fill(Color.accentColor.opacity(0.2))
                .overlay(alignment: .leading) {
                    Capsule().fill(Color.accentColor)
                        .frame(width: geometry.size.width * 0.4)
                        .offset(x: reduceMotion ? 0 : moving ? geometry.size.width : -geometry.size.width * 0.4)
                }
                .clipShape(Capsule())
        }
        .frame(height: 3)
        .accessibilityHidden(true)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) { moving = true }
        }
    }
}

private struct TaskEditorView: View {
    let task: TaskItem
    let list: TaskListValue
    let members: [TaskMember]
    let selfID: String?
    let save: ([String: Any]) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var notes: String
    @State private var nextStep: String
    @State private var evidence: String
    @State private var blockedReason: String
    @State private var researchQuery: String
    @State private var monitorURL: String
    @State private var monitorKeywords: String
    @State private var monitorInterval: Int
    @State private var status: TaskStatusOption
    @State private var assignee: String
    @State private var blockers: Set<String>
    @State private var saving = false

    init(task: TaskItem, list: TaskListValue, members: [TaskMember], selfID: String?, save: @escaping ([String: Any]) async -> Bool) {
        self.task = task; self.list = list; self.members = members; self.selfID = selfID; self.save = save
        _title = State(initialValue: task.title)
        _notes = State(initialValue: task.notes ?? "")
        _nextStep = State(initialValue: task.nextStep ?? "")
        _evidence = State(initialValue: task.evidence ?? "")
        _blockedReason = State(initialValue: task.blockedReason ?? "")
        _researchQuery = State(initialValue: task.researchQuery ?? "")
        _monitorURL = State(initialValue: task.monitorURL ?? "")
        _monitorKeywords = State(initialValue: task.monitorKeywords ?? "")
        _monitorInterval = State(initialValue: task.monitorInterval ?? 360)
        _status = State(initialValue: TaskStatusOption(rawValue: task.status) ?? .open)
        _assignee = State(initialValue: task.assigneeKey)
        _blockers = State(initialValue: Set(task.blockedBy))
    }

    private func control(_ patch: [String: Any]) {
        saving = true
        Task {
            if await save(patch) { dismiss() }
            saving = false
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                Picker("Status", selection: $status) {
                    ForEach(TaskStatusOption.allCases) { Text($0.label).tag($0) }
                }
                Picker("Assignee", selection: $assignee) {
                    Text("Unassigned").tag("")
                    ForEach(members) { member in
                        Text(member.kind == "user" && member.id == selfID ? String(localized: "\(member.name) (You)") : member.name).tag(member.key)
                    }
                }
                Section("Notes") { TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...6) }
                Section("Next step") { TextField("Next step", text: $nextStep, axis: .vertical).lineLimit(2...6) }
                Section("Evidence") { TextField("Evidence", text: $evidence, axis: .vertical).lineLimit(2...6) }
                if task.assigneeKind == "agent" || (task.researchUsed ?? 0) > 0 {
                    Section {
                        TextField("Exact public query", text: $researchQuery, axis: .vertical).lineLimit(2...6)
                            .disabled(assignee != task.assigneeKey || task.assigneeKind != "agent")
                        Text(task.researchDetail).font(.caption)
                    } header: {
                        HStack {
                            Label("Public web research", systemImage: "globe")
                            InfoButton(title: String(localized: "Public web research"), text: String(localized: "Saving this query authorizes one public search with the app closed. Only this exact query is sent; use public information. Leave empty to revoke. Failed or uncertain attempts count. Daily limits also apply. Changing assignee clears permission; save the assignment first. Reports appear in Docs."))
                        }
                    } footer: {
                        // What saving authorizes stays visible next to the field.
                        Text("Saving authorizes one public search with the app closed.")
                    }
                }
                if task.assigneeKind == "agent" || task.monitorURL != nil || (task.monitorTurnsUsed ?? 0) > 0 {
                    Section {
                        let locked = assignee != task.assigneeKey || task.assigneeKind != "agent"
                        TextField("https://example.com/page", text: $monitorURL)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(locked)
                        Picker("Check frequency", selection: $monitorInterval) {
                            ForEach(TaskItem.monitorIntervals, id: \.0) { Text($0.1).tag($0.0) }
                        }
                        .disabled(locked)
                        TextField("Keywords, comma-separated (optional)", text: $monitorKeywords).disabled(locked)
                        Text(task.monitorDetail).font(.caption)
                        ForEach(task.monitorChecks ?? [], id: \.self) { Text($0.label).font(.caption).foregroundStyle(.secondary) }
                    } header: {
                        HStack {
                            Label("Page monitor", systemImage: "eye")
                            InfoButton(title: String(localized: "Page monitor"), text: String(localized: "Saving a public page lets the server check it with the app closed, without the model. The contact gets a turn only when the page text changes (and matches a keyword, if set), up to 3 per day and 20 in total. Redirects are not followed; save the final address. Leave empty to remove. Changing assignee removes the monitor; save the assignment first. Pausing or finishing the task stops checks."))
                        }
                    } footer: {
                        // What saving authorizes stays visible next to the field.
                        Text("Saving lets the server check this page with the app closed.")
                    }
                }
                if task.workState == "blocked" {
                    Section("Blocked reason") { TextField("Blocked reason", text: $blockedReason, axis: .vertical).lineLimit(2...6) }
                }
                if task.assigneeKind == "agent", task.workState != nil, !task.isFinished {
                    Section {
                        if let used = task.workUsed, let limit = task.workLimit { Text("\(used)/\(limit) work turns used") }
                        Button(task.workState == "active" ? "Pause work" : "Resume work", systemImage: task.workState == "active" ? "pause.circle" : "play.circle") {
                            control(["workState": task.workState == "active" ? "paused" : "active"])
                        }
                        .disabled(saving || (task.workState != "active" && (task.workUsed ?? 0) >= (task.workLimit ?? 6)))
                        Button("Cancel task", systemImage: "xmark.circle", role: .destructive) { control(["status": "canceled"]) }.disabled(saving)
                    } header: {
                        HStack {
                            Text("Work")
                            InfoButton(title: String(localized: "Work"), text: String(localized: "Work continues with the app closed. Pausing stops new steps and replies; a step already started may finish. Resuming keeps the remaining budget."))
                        }
                    }
                }
                if list.tasks.count > 1 {
                    Section("Waits for") {
                        ForEach(list.tasks.filter { $0.id != task.id }) { other in
                            Toggle(other.title, isOn: Binding(get: { blockers.contains(other.id) },
                                                              set: { if $0 { blockers.insert(other.id) } else { blockers.remove(other.id) } }))
                        }
                    }
                }
                if let result = task.result { Section("Result") { Text(result) } }
            }
            .navigationTitle("Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saving = true
                        let parts = assignee.split(separator: ":", maxSplits: 1).map(String.init)
                        var patch: [String: Any] = [
                            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                            "notes": notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : notes.trimmingCharacters(in: .whitespacesAndNewlines),
                            "status": status.rawValue,
                            "assignee": parts.count == 2 ? ["kind": parts[0], "id": parts[1]] : NSNull(),
                            "blockedBy": Array(blockers),
                            "nextStep": nextStep.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : nextStep.trimmingCharacters(in: .whitespacesAndNewlines),
                            "evidence": evidence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : evidence.trimmingCharacters(in: .whitespacesAndNewlines),
                            "blockedReason": blockedReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : blockedReason.trimmingCharacters(in: .whitespacesAndNewlines),
                        ]
                        let query = researchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
                        if assignee == task.assigneeKey && query != (task.researchQuery ?? "") {
                            patch["researchQuery"] = query.isEmpty ? NSNull() : query
                        }
                        let url = monitorURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        let keywords = monitorKeywords.trimmingCharacters(in: .whitespacesAndNewlines)
                        if assignee == task.assigneeKey {
                            if url != (task.monitorURL ?? "") { patch["monitorURL"] = url.isEmpty ? NSNull() : url }
                            if keywords != (task.monitorKeywords ?? "") { patch["monitorKeywords"] = keywords.isEmpty ? NSNull() : keywords }
                            if monitorInterval != (task.monitorInterval ?? 360) { patch["monitorInterval"] = monitorInterval }
                        }
                        Task {
                            if await save(patch) { dismiss() }
                            saving = false
                        }
                    }
                    .disabled(saving || title.trimmingCharacters(in: .whitespaces).isEmpty || researchQuery.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count > 600
                        || monitorKeywords.trimmingCharacters(in: .whitespacesAndNewlines).count > 300)
                }
            }
        }
    }
}
