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
        let labels = ["pending": "Pending or uncertain", "ready": "Draft saved", "stopped": "Stopped before publication", "complete": "Report saved", "failed": "Failed"]
        let status = researchStatus.map { " · \(labels[$0] ?? $0)" } ?? ""
        return "\(researchUsed ?? 0)/\(researchLimit ?? 1) web research attempts used\(status)"
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
        let feedback = !isFinished ? reviewFeedback.map { ": \($0)" } ?? "" : ""
        return "Revision round \(rounds)/\(reviewRoundLimit ?? 2)\(feedback)"
    }
    static let monitorIntervals = [(60, "Every hour"), (360, "Every 6 hours"), (1440, "Every day")]
    var monitorDetail: String {
        let interval = Self.monitorIntervals.first { $0.0 == (monitorInterval ?? 360) }?.1.lowercased() ?? ""
        let last = monitorChecks?.first.map { "Last: \($0.label)" } ?? (monitorURL == nil ? "" : "Not checked yet")
        return [monitorURL == nil ? "Page monitor removed" : "Page monitor · \(interval)",
                "\(monitorTurnsUsed ?? 0)/\(monitorTurnLimit ?? 20) change turns used",
                monitorPending == true ? "Change waiting for a turn" : "", last].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    var workLabel: String? {
        if workState == "paused" { return "Paused" }
        if workState == "blocked" { return "Blocked" }
        if let workUsed, let workLimit, workUsed >= workLimit { return "Budget exhausted" }
        return nil
    }
    var assigneeKey: String { assigneeKind.map { "\($0):\(assigneeID ?? "")" } ?? "" }
    var isFinished: Bool { status == "done" || status == "canceled" }
}

struct TaskMonitorCheck: Decodable, Hashable, Sendable {
    let checkedAt: Double
    let outcome: String
    let errorCode: String?
    let httpStatus: Int?
    var label: String {
        let labels = ["baseline": "First check saved", "unchanged": "Unchanged", "repeated": "Earlier version again", "ignored": "Changed, no keyword match", "changed": "Relevant change", "failed": "Check failed"]
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
        case .open: "To do"
        case .in_progress: "In progress"
        case .done: "Done"
        case .canceled: "Canceled"
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
struct TasksView: View {
    let base: String
    let snapshot: NavigationSnapshot<TaskBoard>
    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase
    @State private var busy = false
    @State private var error: String?
    @State private var newList = ""
    @State private var drafts: [String: String] = [:]
    @State private var editing: TaskItem?
    @State private var cancelling: TaskListValue?

    var body: some View {
        Form {
            Section {
                HStack {
                    TextField("New list", text: $newList)
                    Button("Create") { createList() }
                        .disabled(busy || newList.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } footer: {
                if snapshot.value?.lists.isEmpty ?? false {
                    Text("Lists keep shared work in this chat. Contacts can create them, take tasks, wait for blockers, and report results. You can also ask in the chat, for example “Split the trip planning into tasks.”")
                }
            }
            if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
            if snapshot.value == nil && busy { ProgressView("Loading…").frame(maxWidth: .infinity) }
            ForEach(snapshot.value?.lists ?? []) { list in
                Section {
                    ForEach(list.tasks) { task in row(task, in: list) }
                    if list.isActive {
                        HStack {
                            TextField("Add a task", text: Binding(get: { drafts[list.id] ?? "" }, set: { drafts[list.id] = $0 }))
                                .onSubmit { addTask(to: list) }
                            Button("Add") { addTask(to: list) }
                                .disabled(busy || (drafts[list.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                } header: {
                    HStack {
                        Text(list.title)
                        Spacer()
                        if list.isActive {
                            Text("\(list.tasks.filter { $0.status == "done" }.count)/\(list.tasks.filter { $0.status != "canceled" }.count)")
                            Menu {
                                Button("Cancel list", role: .destructive) { cancelling = list }
                            } label: { Image(systemName: "ellipsis.circle") }
                                .accessibilityLabel("List actions")
                        } else {
                            Text("Canceled")
                        }
                    }
                }
            }
        }
        .navigationTitle("Tasks")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
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

    private func row(_ task: TaskItem, in list: TaskListValue) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                Task { await mutate("/items/\(task.id)", method: "PATCH", input: ["version": task.version, "status": task.status == "done" ? "open" : "done"]) }
            } label: {
                Image(systemName: task.status == "done" ? "checkmark.circle.fill" : task.status == "canceled" ? "nosign" : task.blocked ? "clock" : "circle")
                    .font(.title3).foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)
            .disabled(busy || !list.isActive || task.status == "canceled")
            .accessibilityLabel(task.status == "done" ? "Mark \(task.title) not done" : "Mark \(task.title) done")
            Button { if list.isActive { editing = task } } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(task.title).manrope(.body, weight: .semibold)
                            .strikethrough(task.isFinished).foregroundStyle(task.isFinished ? .secondary : .primary)
                        // A contact actively working on this task.
                        if task.assigneeKind == "agent" && task.status == "in_progress" && task.workLabel == nil {
                            Label("Working", systemImage: "circle.fill").labelStyle(.titleAndIcon)
                                .manrope(.caption2, weight: .semibold).imageScale(.small)
                                .foregroundStyle(Color.accentColor)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.15), in: Capsule())
                        }
                    }
                    Text(detail(task, in: list)).manrope(.caption).foregroundStyle(.secondary)
                    if let next = task.nextStep { Text("Next step: \(next)").manrope(.caption) }
                    if task.researchQuery != nil || (task.researchUsed ?? 0) > 0 { Text(task.researchDetail).manrope(.caption) }
                    if task.monitorURL != nil || (task.monitorTurnsUsed ?? 0) > 0 { Text(task.monitorDetail).manrope(.caption) }
                    if task.documentID != nil { Text("Deliverable: \(task.documentTitle ?? "a document")").manrope(.caption) }
                    if let review = task.reviewDetail { Text(review).manrope(.caption) }
                    if let reason = task.blockedReason { Text("Blocked: \(reason)").manrope(.caption) }
                    if let result = task.result { Text(result).manrope(.footnote) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .swipeActions {
            if list.isActive && !task.isFinished {
                Button("Cancel", role: .destructive) {
                    Task { await mutate("/items/\(task.id)", method: "PATCH", input: ["version": task.version, "status": "canceled"]) }
                }
            }
        }
    }

    private func detail(_ task: TaskItem, in list: TaskListValue) -> String {
        var parts = [task.assigneeName ?? "Unassigned"]
        if task.status != "open" { parts.append(TaskStatusOption(rawValue: task.status)?.label ?? task.status) }
        if task.assigneeKind == "agent" {
            if let label = task.workLabel, !task.isFinished { parts.append(label) }
            if let used = task.workUsed, let limit = task.workLimit { parts.append("\(used)/\(limit) work turns used") }
        }
        if task.blocked {
            let waiting = task.blockedBy.compactMap { id in list.tasks.first { $0.id == id && !$0.isFinished }?.title }
            parts.append("Waiting for \(waiting.joined(separator: ", "))")
        }
        return parts.joined(separator: " · ")
    }

    private func createList() {
        let title = newList.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        Task {
            if await mutate("/lists", method: "POST", input: ["id": UUID().uuidString.lowercased(), "title": title, "tasks": [Any]()]) { newList = "" }
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
        catch AuthAPI.Failure.notFound { error = "These tasks are no longer available." }
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
                        Text(member.kind == "user" && member.id == selfID ? "\(member.name) (You)" : member.name).tag(member.key)
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
                            InfoButton(title: "Public web research", text: "Saving this query authorizes one public search with the app closed. Only this exact query is sent; use public information. Leave empty to revoke. Failed or uncertain attempts count. Daily limits also apply. Changing assignee clears permission; save the assignment first. Reports appear in Docs.")
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
                            InfoButton(title: "Page monitor", text: "Saving a public page lets the server check it with the app closed, without the model. The contact gets a turn only when the page text changes (and matches a keyword, if set), up to 3 per day and 20 in total. Redirects are not followed; save the final address. Leave empty to remove. Changing assignee removes the monitor; save the assignment first. Pausing or finishing the task stops checks.")
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
                            InfoButton(title: "Work", text: "Work continues with the app closed. Pausing stops new steps and replies; a step already started may finish. Resuming keeps the remaining budget.")
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
