import Foundation
import Observation

/// The Updates feed that a person's contacts curate together (see docs/updates.md).
/// The API and storage keep the original `home` name (`/api/v1/home`, `home_*` tables).
struct HomeFeed: Decodable, Sendable {
    struct Progress: Decodable, Hashable, Sendable {
        let total: Int
        let done: Int
        let title: String
        let contactID: String
        let contactName: String?
    }
    struct Contributor: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let name: String
        let photoVersion: String?
    }
    struct Topic: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let title: String
        let source: String
        let status: String
        let feedback: String?
        let contactID: String?
        let hasCard: Bool
    }
    struct App: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let title: String
        let subtitle: String?
        let icon: String?
        let contactID: String?
        let groupID: String?
        let ownerName: String?
        var base: String { groupID.map { "groups/\($0)" } ?? "contacts/\(contactID ?? "")" }
    }
    struct AgendaItem: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let kind: String
        let title: String
        let at: Double?
        let contactID: String?
        let groupID: String?
        let name: String?
    }

    let enabled: Bool
    let status: String
    let pending: Bool
    let generatedAt: Double?
    let briefing: String?
    let error: String?
    let progress: Progress?
    let contributors: [Contributor]
    let cards: [HomeCard]
    let topics: [Topic]
    let apps: [App]
    let agenda: [AgendaItem]

    var isUpdating: Bool { status == "updating" || pending }
}

struct HomeCard: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let topicID: String
    let contactID: String?
    let contactName: String?
    let contactPhotoVersion: String?
    let reason: String?
    let source: String
    let feedback: String?
    let connector: Bool
    let generatedAt: Double
    let content: HomeCardContent
}

/// One card of the closed catalog; each kind uses its own subset of fields.
struct HomeCardContent: Decodable, Hashable, Sendable {
    struct Source: Decodable, Hashable, Sendable { let title: String; let url: String }
    /// Headlines, matches, metrics and list items share one shape with optional fields.
    struct Item: Decodable, Hashable, Sendable {
        let title: String?
        let summary: String?
        let source: String?
        let url: String?
        let time: String?
        let home: String?
        let away: String?
        let homeScore: Int?
        let awayScore: Int?
        let status: String?
        let detail: String?
        let label: String?
        let value: String?
        let unit: String?
        let change: String?
        let trend: String?
        let caption: String?
        let trailing: String?
    }
    struct Point: Decodable, Hashable, Sendable { let label: String; let value: Double }
    struct Step: Decodable, Hashable, Sendable { let label: String; let state: String; let detail: String? }

    let kind: String
    let title: String
    let subtitle: String?
    let icon: String
    let accent: String
    let sources: [Source]
    let items: [Item]?
    let columns: [String]?
    let rows: [[String]]?
    let highlight: Int?
    let caption: String?
    let style: String?
    let points: [Point]?
    let unit: String?
    let value: String?
    let change: String?
    let trend: String?
    let summary: String?
    let figure: String?
    let figureLabel: String?
    let status: String?
    let progress: Double?
    let steps: [Step]?
    let note: String?
    let text: String?
    let prompt: String?
}

extension AuthAPI {
    func homeFeed(timeZone: String, token: String) async throws -> HomeFeed {
        try JSONDecoder().decode(HomeFeed.self, from: try await send(path: "home", token: token, query: [URLQueryItem(name: "timeZone", value: timeZone)]).0)
    }
    func homeMutation(path: String, method: String = "POST", body: [String: Any] = [:], token: String) async throws -> HomeFeed {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try JSONDecoder().decode(HomeFeed.self, from: try await send(path: "home/\(path)", method: method, body: data, token: token).0)
    }
}

/// Session-owned Home feed, created by the signed-in shell and dropped with it on
/// sign-out or account switch. Memory only: connector-derived cards are never
/// written to disk. The last feed shows synchronously; reads are deduplicated and
/// revalidated in the background, and a stale response never replaces a newer one.
@MainActor @Observable
final class HomeFeedStore {
    private(set) var feed: HomeFeed?
    private(set) var error: String?
    private(set) var isMutating = false
    @ObservationIgnored private var request: Task<Void, Never>?
    @ObservationIgnored private var loadedAt: Date?
    @ObservationIgnored private var revision = 0

    var isStale: Bool { loadedAt.map { Date.now.timeIntervalSince($0) > 60 } ?? true }

    /// Names in cards and the briefing are resolved per viewer; after an alias change drop the freshness
    /// window and reject in-flight reads, keeping the last feed on screen until the refetch lands.
    func markStale() {
        revision += 1
        request?.cancel()
        request = nil
        loadedAt = nil
    }

    func refresh(using auth: AuthStore, force: Bool = false) async {
        if let request { await request.value; return }
        if !force, !isStale, feed?.isUpdating != true { return }
        let started = revision
        let task = Task { @MainActor in
            do {
                let value = try await auth.withSession { api, token in try await api.homeFeed(timeZone: TimeZone.current.identifier, token: token) }
                guard started == revision else { return }
                feed = value; loadedAt = .now; error = nil
            } catch is CancellationError {
            } catch {
                guard started == revision else { return }
                // Keep usable cards through transient failures; only a first load shows the error.
                if feed == nil || !AuthAPI.isTransient(error) { self.error = error.localizedDescription }
            }
        }
        request = task
        await task.value
        request = nil
    }

    /// Mutations return the whole feed; a newer revision rejects late reads.
    private func mutate(using auth: AuthStore, _ operation: @escaping (AuthAPI, String) async throws -> HomeFeed) async throws {
        isMutating = true
        defer { isMutating = false }
        revision += 1
        request?.cancel()
        request = nil
        let value = try await auth.withSession(operation)
        revision += 1
        feed = value; loadedAt = .now; error = nil
    }

    func requestUpdate(using auth: AuthStore) async throws {
        try await mutate(using: auth) { api, token in try await api.homeMutation(path: "refresh", token: token) }
    }

    func follow(_ text: String, using auth: AuthStore) async throws {
        try await mutate(using: auth) { api, token in try await api.homeMutation(path: "topics", body: ["text": text], token: token) }
    }

    func setTopic(_ id: String, status: String? = nil, feedback: String?? = nil, using auth: AuthStore) async throws {
        var body: [String: Any] = [:]
        if let status { body["status"] = status }
        if let feedback { body["feedback"] = feedback ?? NSNull() }
        try await mutate(using: auth) { api, token in try await api.homeMutation(path: "topics/\(id)", method: "PATCH", body: body, token: token) }
    }
}
