import SwiftUI

struct ConversationLearningItem: Decodable, Sendable, Identifiable {
    struct Evidence: Decodable, Sendable { let id: String; let side: String; let quote: String }
    let key: String
    let kind: String
    let text: String
    let confidence: String
    let opportunity: String
    let avoid: String
    let status: String
    let answer: String
    let updatedAt: Double
    let expiresAt: Double
    let evidence: [Evidence]
    var id: String { key }
    var label: String {
        switch kind {
        case "observation": String(localized: "Observation")
        case "adjustment": String(localized: "Conversation adjustment")
        case "question": String(localized: "Optional question")
        default: kind
        }
    }
    /// Question status (`pending | asked | answered | dismissed`).
    var statusLabel: String {
        switch status {
        case "pending": String(localized: "Pending", comment: "Status of an optional question a contact may ask")
        case "asked": String(localized: "Asked", comment: "Status of an optional question a contact may ask")
        case "answered": String(localized: "Answered", comment: "Status of an optional question a contact may ask")
        case "dismissed": String(localized: "Dismissed", comment: "Status of an optional question a contact may ask")
        default: status.capitalized
        }
    }
}

struct ConversationLearningSnapshot: Decodable, Sendable {
    struct Profile: Decodable, Sendable, Identifiable {
        let agentID: String
        let agentName: String
        let reviewedAt: Double
        let items: [ConversationLearningItem]
        var id: String { agentID }
    }
    let enabled: Bool
    let profiles: [Profile]
}

/// Both audiences use session-owned NavigationSnapshotCache; no private data is persisted to disk.
struct ConversationLearningView: View {
    let base: String
    let cache: NavigationSnapshot<ConversationLearningSnapshot>
    @Environment(AuthStore.self) private var auth
    @State private var busy = false
    @State private var error: String?
    @State private var confirmingReset = false

    var body: some View {
        Form {
            Section {
                if let value = cache.value {
                    Toggle("Learn from my messages", isOn: Binding(get: { value.enabled }, set: { enabled in
                        Task { await refresh(enabled: enabled) }
                    })).disabled(busy)
                } else if busy { ProgressView("Loading…") }
            } footer: {
                Text("Contacts learn your interests and conversational preferences, notice their own repetition, and keep optional questions for relevant moments. Learning stays in this chat. In a group, this screen shows only learning about you, separately for each contact.")
            }
            Section {
                Text("You can correct a preference in conversation. Learning does not enable spontaneous messages or change a contact's configured personality.")
                    .foregroundStyle(.secondary)
                Text("Turning this off clears conversation learning about you. Turning it on starts with new messages. Factual memory has its own rules.")
                    .foregroundStyle(.secondary)
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let value = cache.value {
                if !value.profiles.contains(where: { !$0.items.isEmpty }) {
                    Text("Nothing learned yet. Contacts review recent exchanges as the conversation develops.").foregroundStyle(.secondary)
                }
                ForEach(value.profiles) { profile in
                    Section(profile.agentName) {
                        if profile.reviewedAt > 0 {
                            Text("Last reviewed \(Date(timeIntervalSince1970: profile.reviewedAt / 1000).formatted())")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(profile.items) { item in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.confidence == "supported" ? "\(item.label) · Repeated evidence" : "\(item.label) · Tentative")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(item.text)
                                if item.kind == "question" { Text(item.statusLabel).font(.caption).foregroundStyle(.secondary) }
                                if !item.answer.isEmpty { Text(item.answer) }
                                DisclosureGroup("Context and evidence") {
                                    VStack(alignment: .leading, spacing: 8) {
                                        if !item.opportunity.isEmpty { Text("May fit: \(item.opportunity)") }
                                        if !item.avoid.isEmpty { Text("Avoid: \(item.avoid)") }
                                        ForEach(Array(item.evidence.enumerated()), id: \.offset) { _, evidence in
                                            Text("\(evidence.side == "human" ? String(localized: "You") : profile.agentName): \(evidence.quote)")
                                        }
                                    }.font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(.vertical, 4)
                        }
                    }
                }
                Section {
                    Button("Reset learning about me", role: .destructive) { confirmingReset = true }.disabled(busy)
                }
            }
        }
        .navigationTitle("Conversation learning")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: base) { await refresh() }
        .refreshable { await refresh() }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Refresh", systemImage: "arrow.clockwise") { Task { await refresh() } }.disabled(busy) } }
        .confirmationDialog("Reset learning about you in this chat?", isPresented: $confirmingReset, titleVisibility: .visible) {
            Button("Reset learning", role: .destructive) { Task { await refresh(reset: true) } }
        } message: {
            Text("Contacts will learn again from new messages. Existing chat messages and factual memories stay available.")
        }
    }

    private func refresh(enabled: Bool? = nil, reset: Bool = false) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let mutation = reset || enabled != nil
        if mutation { cache.invalidate() }
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    let body = try enabled.map { try JSONEncoder().encode(["enabled": $0]) }
                    let (data, _) = try await api.send(path: "\(base)/learning", method: reset ? "DELETE" : enabled == nil ? "GET" : "PUT", body: body, token: token)
                    return try JSONDecoder().decode(ConversationLearningSnapshot.self, from: data)
                }
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = String(localized: "This conversation is no longer available.") }
        catch { self.error = error.localizedDescription }
    }
}
