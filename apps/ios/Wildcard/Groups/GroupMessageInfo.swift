import SwiftUI

struct GroupMessageInfo: Decodable, Sendable {
    struct Recipient: Decodable, Sendable, Identifiable {
        let kind: String
        let id: String
        let name: String
        let deliveredAt: Double?
        let readAt: Double?
        var identity: String { "\(kind)/\(id)" }
    }
    let tracked: Bool
    let recipients: [Recipient]
}

struct GroupMessageInfoView: View {
    let groupID: String
    let messageID: String
    let cache: NavigationSnapshot<GroupMessageInfo>
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                if let info = cache.value {
                    if !info.tracked {
                        Text("Read information is unavailable for this older message.")
                    } else {
                        let readers = info.recipients.filter { $0.readAt != nil }
                        let unread = info.recipients.filter { $0.readAt == nil }
                        Section("Read by · \(readers.count)") {
                            if readers.isEmpty { Text("No one has read this message yet.").foregroundStyle(.secondary) }
                            ForEach(readers, id: \.identity) { person in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(person.name)
                                    if let readAt = person.readAt {
                                        Text(Date(timeIntervalSince1970: readAt / 1000), format: .dateTime)
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        Section("Not read yet · \(unread.count)") {
                            ForEach(unread, id: \.identity) { person in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(person.name)
                                    Text(person.deliveredAt == nil ? "Sent" : "Received").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        if info.recipients.isEmpty { Text("No other recipients.").foregroundStyle(.secondary) }
                        Text("Read does not mean someone replied. Contacts can acknowledge reading before preparing a response.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } else if busy { ProgressView("Loading…") }
            }
            .navigationTitle("Message info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .refreshable { await refresh() }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                repeat {
                    await refresh()
                    do { try await Task.sleep(for: .seconds(5)) } catch { return }
                } while !Task.isCancelled
            }
        }
    }

    private func refresh() async {
        busy = true
        defer { busy = false }
        do {
            try await cache.refresh {
                let (data, _) = try await auth.withSession { api, token in
                    try await api.send(path: "groups/\(groupID)/message-info", token: token,
                        query: [URLQueryItem(name: "messageID", value: messageID)])
                }
                return try JSONDecoder().decode(GroupMessageInfo.self, from: data)
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            cache.invalidate(remove: true)
            error = "This message is no longer available."
        } catch { self.error = error.localizedDescription }
    }
}
