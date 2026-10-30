import Foundation
import Observation
import SwiftUI
import UIKit

/// Public page metadata for a link card (docs/link-previews.md).
struct LinkPreview: Decodable, Sendable, Equatable {
    let url: String
    let hash: String
    let status: String
    let title: String?
    let description: String?
    let siteName: String?
    let imageVersion: Double?
}

private struct LinkPreviewResponse: Decodable { let preview: LinkPreview }

/// Session cache of link cards, owned by `PrivateImageCache` so every activation,
/// sign-out, account switch and access-loss clear also drops it. Memory only and
/// bounded; one request per URL is shared, a server "failed" result is kept (no
/// card), and transport failures are retried the next time the bubble appears.
@MainActor
@Observable
final class LinkPreviewCache {
    private(set) var previews: [String: LinkPreview] = [:]
    @ObservationIgnored private var requests: [String: Task<LinkPreview?, Never>] = [:]
    @ObservationIgnored private var order: [String] = []
    @ObservationIgnored private var userID: String?
    @ObservationIgnored private var session = UUID()
    private let limit = 200

    func activate(userID: String) {
        guard self.userID != userID else { return }
        reset()
        self.userID = userID
    }

    func clear(deactivate: Bool = true) {
        reset()
        if deactivate { userID = nil }
    }

    private func reset() {
        session = UUID()
        for request in requests.values { request.cancel() }
        requests.removeAll()
        previews.removeAll()
        order.removeAll()
    }

    func preview(for url: String, using auth: AuthStore) async -> LinkPreview? {
        if let cached = previews[url] { return cached }
        let started = session
        let task = requests[url] ?? Task {
            do {
                return try await auth.withSession { api, token in
                    let data = try await api.send(path: "link-previews", token: token, query: [URLQueryItem(name: "url", value: url)]).0
                    return try JSONDecoder().decode(LinkPreviewResponse.self, from: data).preview
                }
            } catch { return nil }
        }
        requests[url] = task
        let result = await task.value
        // Late responses from an earlier account or session are discarded.
        guard started == session else { return nil }
        requests[url] = nil
        if let result {
            previews[url] = result
            order.append(url)
            if order.count > limit { previews[order.removeFirst()] = nil }
        }
        return result
    }

    /// The link a bubble previews: the first link of a person's message; for a
    /// contact, only a message with exactly one distinct link (source lists get none).
    static func previewLink(_ text: String, fromContact: Bool) -> String? {
        var urls: [String] = []
        for url in MessageMarkdown.detectedLinks(text) where ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            if !urls.contains(url.absoluteString) { urls.append(url.absoluteString) }
        }
        return fromContact ? (urls.count == 1 ? urls.first : nil) : urls.first
    }
}

/// One card per bubble; nothing renders until a ready preview exists. The image
/// comes from the API's copy through the private image cache, never the site.
struct LinkPreviewCardView: View {
    let url: String
    @Environment(AuthStore.self) private var auth
    @Environment(\.openURL) private var openURL
    @State private var preview: LinkPreview?
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let preview, preview.status == "ready", let title = preview.title {
                Button {
                    if let target = URL(string: preview.url), MessageMarkdown.safeLink(target) { openURL(target) }
                } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        if let image {
                            Image(uiImage: image).resizable().scaledToFill()
                                .frame(maxWidth: .infinity, maxHeight: 160).clipped()
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            if let site = preview.siteName { Text(site).manrope(.caption).foregroundStyle(.secondary).lineLimit(1) }
                            Text(title).manrope(.subheadline, weight: .semibold).lineLimit(2)
                            if let description = preview.description {
                                Text(description).manrope(.footnote).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: 300, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityHint("Opens the link")
            }
        }
        .task(id: url) {
            preview = await auth.images.linkPreviews.preview(for: url, using: auth)
            image = nil
            guard let preview, preview.status == "ready", let version = preview.imageVersion else { return }
            image = try? await auth.cachedImage(.linkPreview(hash: preview.hash, version: Int(version)), maxPixelSize: 600)
        }
    }
}
