import SwiftUI

/// A chat attachment listed in chat details. Private chats set `side`; groups set the sender.
struct ChatMediaItem: Decodable, Hashable, Sendable, Identifiable {
    let messageID: String
    let sequence: Int
    let createdAt: Double
    let name: String
    let mimeType: String
    let size: Int
    let side: String?
    let senderName: String?
    var id: String { "\(messageID)/\(side ?? "group")" }
    var attachment: ChatAttachment { ChatAttachment(name: name, mimeType: mimeType, size: size) }
}

struct ChatMediaPage: Decodable, Sendable {
    var items: [ChatMediaItem]
    var nextBefore: Int?
}

enum ChatMediaKind: String, CaseIterable, Identifiable {
    case image, file
    var id: String { rawValue }
    var title: String { self == .image ? "Media" : "Docs" }
}

/// Where a chat's media lives: a private chat with a contact, or a group.
enum ChatMediaScope: Hashable {
    case contact(String)
    case group(String)
    var path: String {
        switch self {
        case .contact(let id): return "contacts/\(id)/chat"
        case .group(let id): return "groups/\(id)"
        }
    }
    func cacheKey(_ kind: ChatMediaKind) -> String { "\(path)|\(kind.rawValue)" }
}

extension AuthAPI {
    func chatMedia(scope: ChatMediaScope, kind: ChatMediaKind, before: Int?, token: String) async throws -> ChatMediaPage {
        var query = [URLQueryItem(name: "kind", value: kind.rawValue)]
        if let before { query.append(URLQueryItem(name: "before", value: String(before))) }
        let (data, _) = try await send(path: "\(scope.path)/media", token: token, query: query)
        return try JSONDecoder().decode(ChatMediaPage.self, from: data)
    }
}

extension NavigationSnapshotCache where Value == ChatMediaPage {
    func forget(_ scope: ChatMediaScope) {
        for kind in ChatMediaKind.allCases { remove(id: scope.cacheKey(kind)) }
    }
}

/// WhatsApp-style chat details tabs: an image grid and a list of shared files.
/// Pages are session-cached per chat and kind; image bytes use `PrivateImageCache`.
struct ChatMediaSection: View {
    let scope: ChatMediaScope
    let cache: NavigationSnapshotCache<ChatMediaPage>
    /// The Docs tab lists contact-authored Markdown documents before shared files.
    let documents: DocumentCaches
    @Environment(AuthStore.self) private var auth
    @State private var kind = ChatMediaKind.image
    @State private var requests = 0
    @State private var error: String?
    @State private var viewing: ChatMediaItem?
    private var snapshot: NavigationSnapshot<ChatMediaPage> { cache.store(for: scope.cacheKey(kind)) }
    private var loading: Bool { requests > 0 }

    var body: some View {
        Section {
            Picker("Shared in this chat", selection: $kind) {
                ForEach(ChatMediaKind.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .listRowSeparator(.hidden)
            if kind == .file {
                DocumentListRows(base: documentsBase, caches: documents)
                Text("Files").manrope(.footnote, weight: .semibold).foregroundStyle(.secondary)
            }
            if let page = snapshot.value {
                if page.items.isEmpty {
                    Text(kind == .image ? "No photos in this chat yet." : "No files in this chat yet.")
                        .manrope(.footnote).foregroundStyle(.secondary)
                } else if kind == .image {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 3), spacing: 2) {
                        ForEach(page.items) { item in
                            ChatMediaThumbnail(resource: resource(item)) { viewing = item }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
                } else {
                    ForEach(page.items) { item in ChatMediaFileRow(item: item, scope: scope) }
                }
                if page.nextBefore != nil {
                    Button("Load more") { Task { await load(more: true) } }.disabled(loading)
                }
            } else if loading {
                ProgressView("Loading…").frame(maxWidth: .infinity)
            }
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
                Button("Retry") { Task { await load() } }.disabled(loading)
            }
        } header: { Text("Shared in this chat") }
        .task(id: "\(auth.user?.id ?? "")|\(scope.cacheKey(kind))") { await load() }
        .fullScreenCover(item: $viewing) { item in
            AttachmentImageViewer(attachment: item.attachment, contactID: contactID, turnID: item.messageID,
                                  groupID: groupID, assistantAttachment: item.side == "assistant")
        }
    }

    private var contactID: String { if case .contact(let id) = scope { return id } else { return "" } }
    private var documentsBase: String {
        switch scope {
        case .contact(let id): return "contacts/\(id)"
        case .group(let id): return "groups/\(id)"
        }
    }
    private var groupID: String? { if case .group(let id) = scope { return id } else { return nil } }

    private func resource(_ item: ChatMediaItem) -> CachedImageResource {
        switch scope {
        case .group(let id): return .groupAttachment(groupID: id, messageID: item.messageID)
        case .contact(let id):
            return item.side == "assistant" ? .assistantAttachment(contactID: id, turnID: item.messageID)
                : .attachment(contactID: id, turnID: item.messageID)
        }
    }

    /// Cached pages show immediately; the first page revalidates on every visit and
    /// "Load more" appends the next page to the cached value.
    private func load(more: Bool = false) async {
        let snapshot = snapshot, scope = scope, kind = kind
        let current = snapshot.value
        // Snapshots deduplicate first-page requests; only "Load more" waits for the others.
        if more && (loading || current?.nextBefore == nil) { return }
        requests += 1
        defer { requests -= 1 }
        do {
            try await snapshot.refresh {
                let page = try await auth.withSession { api, token in
                    try await api.chatMedia(scope: scope, kind: kind, before: more ? current?.nextBefore : nil, token: token)
                }
                return more ? ChatMediaPage(items: (current?.items ?? []) + page.items, nextBefore: page.nextBefore) : page
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            cache.forget(scope)
            error = "This chat is no longer available."
        }
        catch {
            // Keep usable content visible through transient failures.
            if snapshot.value == nil || more { self.error = error.localizedDescription }
        }
    }
}

private struct ChatMediaThumbnail: View {
    let resource: CachedImageResource
    let open: () -> Void
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var failed = false
    @State private var attempt = 0

    var body: some View {
        Button {
            if image != nil { open() } else { attempt += 1 }
        } label: {
            Color(uiColor: .secondarySystemBackground)
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    if let image = image ?? auth.images.cachedImage(resource, maxPixelSize: 520) {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else if failed {
                        Image(systemName: "arrow.clockwise").foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                    }
                }
                .clipped()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(image == nil && failed ? "Retry loading image" : "Open image full screen")
        .task(id: "\(auth.user?.id ?? "")/\(resource.key)/\(attempt)") {
            failed = false
            do { image = try await auth.cachedImage(resource, maxPixelSize: 520) }
            catch is CancellationError { }
            catch { if !Task.isCancelled { failed = true } }
        }
    }
}

private struct ChatMediaFileRow: View {
    let item: ChatMediaItem
    let scope: ChatMediaScope
    @Environment(AuthStore.self) private var auth
    @State private var loading = false
    @State private var previewURL: URL?
    @State private var error: String?
    @State private var task: Task<Void, Never>?

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                if loading { ProgressView().frame(width: 28) }
                else { Image(systemName: "doc.richtext").font(.title2).foregroundStyle(Color.accentColor).frame(width: 28) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).manrope(.body, weight: .semibold).lineLimit(2)
                    Text([item.senderName, ByteCountFormatter.string(fromByteCount: Int64(item.size), countStyle: .file),
                          Date(timeIntervalSince1970: item.createdAt / 1000).formatted(date: .abbreviated, time: .omitted)]
                        .compactMap { $0 }.joined(separator: " · "))
                        .manrope(.caption).foregroundStyle(.secondary)
                    if let error { Text(error).manrope(.caption).foregroundStyle(.red) }
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(loading)
        .sheet(isPresented: Binding(get: { previewURL != nil }, set: { if !$0 { clearPreview() } })) {
            if let previewURL { AttachmentQuickLook(url: previewURL).ignoresSafeArea() }
        }
        .onDisappear { task?.cancel(); clearPreview() }
    }

    private func open() {
        guard !loading else { return }
        loading = true
        error = nil
        task = Task {
            defer { loading = false }
            do {
                let bytes = try await auth.withSession { api, token in
                    switch scope {
                    case .group(let id): return try await api.groupAttachment(groupID: id, messageID: item.messageID, token: token)
                    case .contact(let id):
                        return try await api.chatAttachment(contactID: id, turnID: item.messageID, assistant: item.side == "assistant", token: token)
                    }
                }
                try Task.checkCancellation()
                let folder = FileManager.default.temporaryDirectory.appending(path: "chat-preview-\(UUID().uuidString)")
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let url = folder.appendingPathComponent(item.name)
                try bytes.write(to: url, options: [.atomic, .completeFileProtection])
                previewURL = url
            } catch is CancellationError { }
            catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
        }
    }

    private func clearPreview() {
        if let previewURL { try? FileManager.default.removeItem(at: previewURL.deletingLastPathComponent()) }
        previewURL = nil
    }
}
