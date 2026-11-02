import SwiftUI
import UIKit

/// "Export chat" row for a private chat or group details screen (docs/chat-export.md).
/// Explicit downloads bypass the conversation caches: each export reads current history,
/// writes one temporary file for the share sheet and deletes it when the sheet closes.
struct ChatExportRow: View {
    enum Scope {
        case contact(String)
        case group(String)
        var path: String {
            switch self {
            case .contact(let id): "contacts/\(id)/chat/export"
            case .group(let id): "groups/\(id)/export"
            }
        }
        var isGroup: Bool { if case .group = self { true } else { false } }
    }

    let scope: Scope
    @Environment(AuthStore.self) private var auth
    @State private var confirming = false
    @State private var exporting = false
    @State private var file: ExportedFile?
    @State private var error: String?

    private var message: String {
        scope.isGroup
            ? String(localized: "Download this group as a JSON file with every message you can read, who sent it and when, replies and reactions. It includes messages from every member. Attachments are listed by name only; files, images and audio are not included. Review the file before sharing it with anyone or with an AI. Nothing is sent to an AI by this download.")
            : String(localized: "Download this chat as a JSON file with every message you can read, who sent it and when, replies and reactions. Attachments are listed by name only; files, images and audio are not included. Review the file before sharing it with anyone or with an AI. Nothing is sent to an AI by this download.")
    }

    var body: some View {
        Button { confirming = true } label: {
            HStack {
                Label("Export chat", systemImage: "square.and.arrow.up")
                Spacer()
                if exporting { ProgressView() }
            }
        }
        .disabled(exporting)
        .confirmationDialog("Export chat", isPresented: $confirming, titleVisibility: .visible) {
            Button("Export JSON") { Task { await export() } }
            Button("Cancel", role: .cancel) {}
        } message: { Text(message) }
        .alert("Export failed", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
        .sheet(item: $file, onDismiss: ChatExportFiles.removeAll) { file in
            ActivityView(url: file.url).presentationDetents([.medium, .large])
        }
    }

    private func export() async {
        guard !exporting, let owner = auth.user?.id else { return }
        exporting = true
        defer { exporting = false }
        do {
            // A long chat is assembled in one response, so allow more than the default 30 s.
            let data = try await auth.withSession { api, token in
                try await api.send(path: scope.path, token: token, timeout: 120).0
            }
            // withSession rejects responses after sign-out; also drop them after an account switch.
            guard auth.user?.id == owner else { return }
            file = try ChatExportFiles.write(data)
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ExportedFile: Identifiable {
    let id = UUID()
    let url: URL
}

/// Temporary export files. Only one exists at a time and none outlives its share sheet.
enum ChatExportFiles {
    private static var directory: URL { FileManager.default.temporaryDirectory.appending(path: "ChatExports", directoryHint: .isDirectory) }

    static func write(_ data: Data) throws -> ExportedFile {
        // Validate the whole document before offering it, then pretty-print it for reading.
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let chat = object["chat"] as? [String: Any] else { throw AuthAPI.Failure.invalidResponse }
        let pretty = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        removeAll()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let date = (object["exportedAt"] as? String).map { String($0.prefix(10)) } ?? ""
        let url = directory.appending(path: "wildcard-chat-\(slug(chat["name"] as? String ?? ""))-\(date).json")
        try pretty.write(to: url, options: [.atomic, .completeFileProtection])
        return ExportedFile(url: url)
    }

    static func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }

    /// Same file name rule as the web client.
    private static func slug(_ name: String) -> String {
        let folded = name.decomposedStringWithCompatibilityMapping
        var result = ""
        var pendingDash = false
        for scalar in folded.unicodeScalars {
            if scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "_" || scalar == "-") {
                if pendingDash && !result.isEmpty { result.append("-") }
                pendingDash = false
                result.unicodeScalars.append(scalar)
            } else {
                pendingDash = true
            }
        }
        let trimmed = String(result.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "-")).prefix(60))
        return trimmed.isEmpty ? "export" : trimmed
    }
}

private struct ActivityView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
