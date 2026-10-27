import Foundation
import UniformTypeIdentifiers
import UIKit
import QuickLook
import SwiftUI

struct ChatAttachment: Codable, Equatable, Sendable {
    let name: String
    let mimeType: String
    let size: Int
    var isImage: Bool { mimeType.hasPrefix("image/") }
}

struct DraftAttachment: Encodable, Equatable, Sendable {
    let id = UUID()
    let name: String
    let mimeType: String
    let data: Data
    enum CodingKeys: String, CodingKey { case name, mimeType, data }
    static let limit = 5 * 1024 * 1024
    static let types: [UTType] = [.jpeg, .png, .gif, .webP, .pdf]

    static func load(url: URL) throws -> DraftAttachment {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
        guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= limit else {
            throw AuthAPI.Failure.rejected("Choose a file up to 5 MB.")
        }
        guard let type = values.contentType, types.contains(where: { type.conforms(to: $0) }),
              let mime = type.preferredMIMEType else {
            throw AuthAPI.Failure.rejected("Choose a JPEG, PNG, GIF, WebP, or PDF.")
        }
        let bytes = try Data(contentsOf: url, options: .mappedIfSafe)
        guard bytes.count <= limit else { throw AuthAPI.Failure.rejected("Choose a file up to 5 MB.") }
        let name = String(url.lastPathComponent.prefix(180))
        return DraftAttachment(name: name, mimeType: mime, data: bytes)
    }
}

struct AttachmentQuickLook: UIViewControllerRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> any QLPreviewItem { url as NSURL }
    }
}

struct ChatAttachmentView: View {
    let attachment: ChatAttachment
    let contactID: String
    let turnID: String
    @Environment(AuthStore.self) private var auth
    @State private var loading = false
    @State private var previewURL: URL?
    @State private var error: String?

    var body: some View {
        HStack {
            Spacer(minLength: 40)
            VStack(alignment: .trailing, spacing: 6) {
                Button {
                    guard !loading else { return }
                    loading = true
                    Task {
                        defer { loading = false }
                        do {
                            let bytes = try await auth.withSession { api, token in
                                try await api.chatAttachment(contactID: contactID, turnID: turnID, token: token)
                            }
                            try Task.checkCancellation()
                            let folder = FileManager.default.temporaryDirectory.appending(path: "chat-preview-\(UUID().uuidString)")
                            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                            let url = folder.appendingPathComponent(attachment.name)
                            try bytes.write(to: url, options: [.atomic, .completeFileProtection])
                            previewURL = url
                        } catch { self.error = error.localizedDescription }
                    }
                } label: {
                    HStack {
                        if loading { ProgressView() }
                        else { Image(systemName: attachment.isImage ? "photo" : "doc.richtext") }
                        VStack(alignment: .leading) {
                            Text(attachment.name).lineLimit(2)
                            Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.size), countStyle: .file)).font(.caption)
                        }
                        Image(systemName: "arrow.down.circle")
                    }.manrope(.footnote).padding(12)
                }
                .buttonStyle(.plain)
                .background(Color("OutgoingMessageBackground"), in: RoundedRectangle(cornerRadius: 16))
                .disabled(loading)
                if let error { Text(error).manrope(.caption).foregroundStyle(.red) }
            }
        }
        .sheet(isPresented: Binding(get: { previewURL != nil }, set: { if !$0 { clearPreview() } })) {
            if let previewURL { AttachmentQuickLook(url: previewURL).ignoresSafeArea() }
        }
        .onDisappear { clearPreview() }
    }
    private func clearPreview() {
        if let previewURL { try? FileManager.default.removeItem(at: previewURL.deletingLastPathComponent()) }
        previewURL = nil
    }
}
