import SwiftUI

/// Linked contacts of one contact (docs/contacts.md#linked-contacts). Links are mutual and
/// only between the person's own contacts; linked contacts can ask each other things and
/// pass messages along in the person's chats.
struct ContactLinks: Decodable, Sendable {
    struct Item: Decodable, Sendable, Identifiable, Hashable {
        let id: String
        let name: String
        let photoVersion: String?
    }
    let links: [Item]
    let available: [Item]
    let unavailable: String?
    /// "Contacts share with each other" is on: every eligible contact is linked too (docs/privacy.md).
    var allContacts: Bool? = nil
}

struct ContactLinksView: View {
    let contactID: String
    /// Session-owned snapshot from ContactsStore.linkSnapshots, shown at once on return.
    let cache: NavigationSnapshot<ContactLinks>
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var busy = false
    @State private var error: String?
    @State private var choice = ""

    var body: some View {
        Form {
            Section {
                Text("Linked contacts can ask each other things and pass messages along in your chats, for example “ask Tomi what we decided” or “tell Vale about the trip”. Links work both ways and only between your own contacts.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let state = cache.value {
                if let unavailable = state.unavailable {
                    Section { Text(unavailable).foregroundStyle(.secondary) }
                } else {
                    if state.allContacts == true {
                        Section {
                            Text("Contacts share with each other is on, so this contact can already reach all your contacts except private chats. Links you add here stay if you turn it off.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Section("Linked") {
                        if state.links.isEmpty { Text("No linked contacts yet.").foregroundStyle(.secondary) }
                        ForEach(state.links) { item in
                            HStack(spacing: 12) {
                                ContactAvatar(contact: contacts.contact(id: item.id), size: 36)
                                Text(item.name).lineLimit(1)
                                Spacer(minLength: 0)
                                Button("Unlink", role: .destructive) { Task { await change(item.id, link: false) } }
                                    .buttonStyle(.borderless)
                            }
                        }
                    }
                    if !state.available.isEmpty {
                        Section {
                            Picker("Contact", selection: $choice) {
                                Text("Choose…").tag("")
                                ForEach(state.available) { Text($0.name).tag($0.id) }
                            }
                            Button("Link") { let id = choice; choice = ""; Task { await change(id, link: true) } }
                                .disabled(choice.isEmpty)
                        } header: { Text("Link a contact") }
                    }
                }
            } else if error == nil {
                Section { ProgressView("Loading linked contacts…") }
            }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Retry") { Task { await refresh() } }
                }
            }
        }
        .disabled(busy)
        .navigationTitle("Linked contacts")
        .refreshable { await refresh() }
        .task(id: scenePhase) { if scenePhase == .active { await refresh() } }
    }

    private func refresh() async {
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    try JSONDecoder().decode(ContactLinks.self, from: try await api.send(path: "contacts/\(contactID)/links", token: token).0)
                }
            }
            error = nil
        } catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = "This contact is no longer available." }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }

    /// Links are mutual: every snapshot is invalidated, and the change's response becomes this one.
    private func change(_ otherID: String, link: Bool) async {
        busy = true
        defer { busy = false }
        contacts.linkSnapshots.invalidateAll()
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    try JSONDecoder().decode(ContactLinks.self, from: try await api.send(path: "contacts/\(contactID)/links/\(otherID)", method: link ? "PUT" : "DELETE", token: token).0)
                }
            }
            error = nil
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
