import SwiftUI

struct ResearchProvenance: Decodable, Hashable, Sendable {
    struct Source: Decodable, Hashable, Sendable {
        let title: String
        let url: String
        let cited: Bool
    }
    let checkedAt: Double
    let query: String
    let originalRevision: Int
    let sources: [Source]
    var citedCount: Int { sources.filter(\.cited).count }
}

/// Markdown documents in a private chat or group (see docs/documents.md).
struct ChatDocumentSummary: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let title: String
    let revision: Int
    let sourceID: String?
    let preview: String
    let updatedByName: String
    let updatedAt: Double
    let research: ResearchProvenance?
}

struct ChatDocumentRevision: Decodable, Hashable, Sendable, Identifiable {
    let revision: Int
    let summary: String?
    let authorName: String
    let createdAt: Double
    var id: Int { revision }
}

struct ChatDocument: Decodable, Hashable, Sendable {
    let id: String
    let title: String
    let body: String
    let revision: Int
    let updatedByName: String
    let updatedAt: Double
    let revisions: [ChatDocumentRevision]
    let research: ResearchProvenance?
}

extension AuthAPI {
    /// `base` is `contacts/:id` or `groups/:id`.
    func documents(base: String, token: String) async throws -> [ChatDocumentSummary] {
        struct Response: Decodable { let documents: [ChatDocumentSummary] }
        return try JSONDecoder().decode(Response.self, from: try await send(path: "\(base)/documents", token: token).0).documents
    }
    func document(base: String, id: String, method: String = "GET", input: [String: Any]? = nil, token: String) async throws -> ChatDocument {
        struct Response: Decodable { let document: ChatDocument }
        let body = try input.map { try JSONSerialization.data(withJSONObject: $0) }
        let path = method == "POST" ? "\(base)/documents" : "\(base)/documents/\(id)"
        return try JSONDecoder().decode(Response.self, from: try await send(path: path, method: method, body: body, token: token).0).document
    }
}

/// Session-owned document caches for one kind of chat: lists per chat and open documents.
@MainActor
final class DocumentCaches {
    let lists = NavigationSnapshotCache<[ChatDocumentSummary]>()
    let documents = NavigationSnapshotCache<ChatDocument>()

    func list(_ base: String) -> NavigationSnapshot<[ChatDocumentSummary]> { lists.store(for: base) }
    func document(_ base: String, _ id: String) -> NavigationSnapshot<ChatDocument> { documents.store(for: "\(base)/\(id)") }

    /// Lists are revalidated whenever a chat shows new replies; requests are deduplicated.
    func refresh(_ base: String, auth: AuthStore) async {
        try? await list(base).refresh {
            try await auth.withSession { api, token in try await api.documents(base: base, token: token) }
        }
    }

    /// Cached names are server-resolved per viewer; keep the entries visible but force revalidation.
    func invalidateAll() {
        lists.invalidateAll()
        documents.invalidateAll()
    }

    func forget(_ base: String) {
        lists.remove(id: base)
        // Open documents are dropped by their own 404 or by LRU; the list is the entry point.
    }
}

/// Entry point in the message that created a document.
struct DocumentCardView: View {
    let document: ChatDocumentSummary
    let base: String
    let caches: DocumentCaches
    /// Inside the sender's message bubble instead of on its own.
    var embedded = false
    @State private var presented = false

    var body: some View {
        Button { presented = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "doc.text.fill").font(.title3).foregroundStyle(Color.accentColor).frame(width: 36, height: 36)
                    .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(document.title).manrope(.subheadline, weight: .bold).foregroundStyle(.primary).lineLimit(1)
                    if let research = document.research {
                        Text("Web research · \(research.citedCount) cited sources").manrope(.footnote).foregroundStyle(.secondary)
                    }
                    Text(document.preview.isEmpty ? "Empty document" : document.preview).manrope(.footnote).foregroundStyle(.secondary).lineLimit(1)
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
        .accessibilityLabel("\(document.title), document")
        .fullScreenCover(isPresented: $presented) { DocumentScreen(base: base, documentID: document.id, caches: caches) }
    }
}

/// Documents section for the Docs tab of chat details.
struct DocumentListRows: View {
    let base: String
    let caches: DocumentCaches
    @Environment(AuthStore.self) private var auth
    @State private var presented: String?
    @State private var naming = false
    @State private var title = ""
    @State private var error: String?

    var body: some View {
        ForEach(caches.list(base).value ?? []) { document in
            Button { presented = document.id } label: {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(document.title).manrope(.body, weight: .semibold).foregroundStyle(.primary)
                        Text("\(document.updatedByName) · \(Date(timeIntervalSince1970: document.updatedAt / 1000).formatted(date: .abbreviated, time: .omitted))")
                            .manrope(.caption).foregroundStyle(.secondary)
                    }
                } icon: { Image(systemName: "doc.text") }
            }
            .buttonStyle(.plain)
        }
        if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
        Button { title = ""; naming = true } label: { Label("New document", systemImage: "plus") }
            .task(id: base) { await caches.refresh(base, auth: auth) }
            .alert("New document", isPresented: $naming) {
                TextField("Title", text: $title)
                Button("Create") { create() }
                Button("Cancel", role: .cancel) { }
            }
            .fullScreenCover(item: Binding(get: { presented.map { DocumentID(id: $0) } }, set: { presented = $0?.id })) { item in
                DocumentScreen(base: base, documentID: item.id, caches: caches)
            }
    }

    private struct DocumentID: Identifiable { let id: String }

    private func create() {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task {
            do {
                let id = UUID().uuidString.lowercased()
                let created = try await auth.withSession { api, token in
                    try await api.document(base: base, id: id, method: "POST", input: ["id": id, "title": trimmed, "body": ""], token: token)
                }
                try? await caches.document(base, created.id).refresh { created }
                caches.list(base).invalidate()
                await caches.refresh(base, auth: auth)
                presented = created.id
                error = nil
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}

/// A document opens full screen like a mini app: rendered Markdown, an editor with
/// preview, recent revisions and delete. Saves carry the revision they started from.
struct DocumentScreen: View {
    let base: String
    let documentID: String
    let caches: DocumentCaches
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var editing = false
    @State private var preview = false
    @State private var showHistory = false
    @State private var busy = false
    @State private var error: String?
    @State private var conflict: String?
    @State private var confirmDelete = false
    @State private var draftTitle = ""
    @State private var draftBody = ""
    @State private var draftSummary = ""
    @State private var baseRevision = 0
    private var snapshot: NavigationSnapshot<ChatDocument> { caches.document(base, documentID) }
    private var changed: Bool { snapshot.value.map { draftTitle != $0.title || draftBody != $0.body } ?? false }

    var body: some View {
        NavigationStack {
            Group {
                if let document = snapshot.value {
                    if editing { editor } else { viewer(document) }
                } else if let error {
                    ContentUnavailableView("Document unavailable", systemImage: "doc.questionmark", description: Text(error))
                } else {
                    ProgressView("Loading…").frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle(editing ? "Edit document" : snapshot.value?.title ?? "Document")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if editing {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editing = false }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { Task { await save() } }
                            .disabled(busy || !changed || draftTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } else {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                    }
                    if snapshot.value != nil {
                        ToolbarItem(placement: .primaryAction) {
                            Menu {
                                Button("Edit", systemImage: "pencil") { startEditing() }
                                Button(showHistory ? "Hide revisions" : "Revisions", systemImage: "clock.arrow.circlepath") { showHistory.toggle() }
                                Button("Delete", systemImage: "trash", role: .destructive) { confirmDelete = true }
                            } label: { Image(systemName: "ellipsis.circle") }
                                .accessibilityLabel("Document actions")
                        }
                    }
                }
            }
            .confirmationDialog("Delete this document for everyone in this chat?", isPresented: $confirmDelete) {
                Button("Delete", role: .destructive) { Task { await remove() } }
            } message: { Text("Its revisions are deleted too.") }
            .interactiveDismissDisabled(editing && changed)
        }
        // Contacts may be editing; keep the viewer current, but never replace an open draft.
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                if !editing { await load() }
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }

    private func viewer(_ document: ChatDocument) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Revision \(document.revision) · Updated by \(document.updatedByName) · \(Date(timeIntervalSince1970: document.updatedAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                    .manrope(.caption).foregroundStyle(.secondary)
                if let research = document.research {
                    DisclosureGroup("Web research · \(research.citedCount) cited sources") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Checked \(Date(timeIntervalSince1970: research.checkedAt / 1000).formatted(date: .abbreviated, time: .shortened)) · Sources refer to revision \(research.originalRevision).")
                                .manrope(.caption).foregroundStyle(.secondary)
                            Text(research.query).manrope(.footnote)
                            ForEach(research.sources, id: \.url) { source in
                                if let url = URL(string: source.url), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                                    Link(destination: url) {
                                        Text("\(source.title) · \(source.cited ? "Cited" : "Retrieved")").manrope(.footnote)
                                    }
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                    }
                }
                if showHistory {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(document.revisions) { revision in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(revision.revision) · \(revision.authorName) · \(Date(timeIntervalSince1970: revision.createdAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                                    .manrope(.footnote, weight: .semibold)
                                Text(revision.summary ?? "No summary").manrope(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                if document.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("This document is empty. Edit it, or ask a contact in the chat to write it.").manrope().foregroundStyle(.secondary)
                } else {
                    MessageMarkdownView(markdown: MessageMarkdown(document.body)).textSelection(.enabled)
                }
            }
            .padding()
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private var editor: some View {
        VStack(spacing: 8) {
            if let conflict {
                VStack(alignment: .leading, spacing: 6) {
                    Text(conflict).manrope(.footnote)
                    HStack {
                        Button("Use their version") { editing = false; self.conflict = nil }
                        Spacer()
                        Button("Keep mine") { baseRevision = snapshot.value?.revision ?? baseRevision; self.conflict = nil }
                    }.manrope(.footnote, weight: .semibold)
                }
                .padding(12).background(Color.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            TextField("Title", text: $draftTitle).manrope(.title3, weight: .bold)
            Picker("Mode", selection: $preview) {
                Text("Write").tag(false)
                Text("Preview").tag(true)
            }
            .pickerStyle(.segmented)
            if preview {
                ScrollView { MessageMarkdownView(markdown: MessageMarkdown(draftBody.isEmpty ? "*Nothing to preview.*" : draftBody)).frame(maxWidth: .infinity, alignment: .leading) }
            } else {
                TextEditor(text: $draftBody).font(.system(.body, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            TextField("What changed? (optional)", text: $draftSummary).manrope(.footnote)
            if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
        }
        .padding()
    }

    private func startEditing() {
        guard let document = snapshot.value else { return }
        draftTitle = document.title; draftBody = document.body; draftSummary = ""
        baseRevision = document.revision; conflict = nil; preview = false; editing = true
    }

    private func load() async {
        do {
            try await snapshot.refresh {
                try await auth.withSession { api, token in try await api.document(base: base, id: documentID, token: token) }
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            caches.documents.remove(id: "\(base)/\(documentID)")
            error = "It was deleted or you no longer have access."
        } catch {
            if snapshot.value == nil { self.error = error.localizedDescription }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let input: [String: Any] = ["baseRevision": baseRevision, "title": draftTitle.trimmingCharacters(in: .whitespacesAndNewlines), "body": draftBody,
                                    "summary": draftSummary.trimmingCharacters(in: .whitespacesAndNewlines)]
        do {
            let saved = try await auth.withSession { api, token in
                try await api.document(base: base, id: documentID, method: "PUT", input: input, token: token)
            }
            snapshot.invalidate()
            try? await snapshot.refresh { saved }
            caches.list(base).invalidate()
            await caches.refresh(base, auth: auth)
            editing = false; error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.conflict(let message) {
            await load()
            conflict = "\(message) Latest: revision \(snapshot.value?.revision ?? 0) by \(snapshot.value?.updatedByName ?? "someone")."
        } catch { self.error = error.localizedDescription }
    }

    private func remove() async {
        do {
            _ = try await auth.withSession { api, token in try await api.send(path: "\(base)/documents/\(documentID)", method: "DELETE", token: token) }
            caches.documents.remove(id: "\(base)/\(documentID)")
            caches.list(base).invalidate()
            await caches.refresh(base, auth: auth)
            dismiss()
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
