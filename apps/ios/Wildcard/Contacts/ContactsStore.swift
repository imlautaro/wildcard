import Foundation
import Observation

@MainActor
@Observable
final class ContactsStore {
    private(set) var contacts: [Contact] = []
    private(set) var nextCursor: String?
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var isMutating = false
    private(set) var error: String?
    let conversations = ConversationCache()
    private var refreshedAt: Date?
    private var contactRefreshedAt: [String: Date] = [:]
    private var refreshingContacts: Set<String> = []
    private let freshness: TimeInterval = 30
    private var generation = 0
    private var knownContacts: [String: Contact] = [:]

    func contact(id: String) -> Contact? { knownContacts[id] }

    func refresh(using auth: AuthStore, force: Bool = true) async {
        guard !isMutating, !isLoading else { return }
        if !force, let refreshedAt, Date().timeIntervalSince(refreshedAt) < freshness { return }
        generation += 1
        let request = generation
        isLoading = true
        isLoadingMore = false
        error = nil
        defer { if request == generation { isLoading = false } }
        do {
            let page = try await auth.withSession { api, token in try await api.contacts(token: token) }
            guard request == generation, !Task.isCancelled else { return }
            for contact in page.contacts {
                knownContacts[contact.id] = contact
                contactRefreshedAt[contact.id] = .now
            }
            contacts = page.contacts
            nextCursor = page.nextCursor
            hasLoaded = true
            refreshedAt = .now
        } catch {
            if request == generation && !isCancellation(error) { self.error = error.localizedDescription }
        }
    }

    func loadMore(using auth: AuthStore) async {
        guard !isLoading, !isLoadingMore, !isMutating, let cursor = nextCursor else { return }
        let request = generation
        isLoadingMore = true
        error = nil
        defer { if request == generation { isLoadingMore = false } }
        do {
            let page = try await auth.withSession { api, token in try await api.contacts(token: token, before: cursor) }
            guard request == generation, !Task.isCancelled else { return }
            for contact in page.contacts {
                knownContacts[contact.id] = contact
                contactRefreshedAt[contact.id] = .now
            }
            let known = Set(contacts.map(\.id))
            contacts.append(contentsOf: page.contacts.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            if request == generation && !isCancellation(error) { self.error = error.localizedDescription }
        }
    }

    func save(name: String, contactID: String?, using auth: AuthStore) async throws {
        try beginMutation()
        do {
            let saved = try await auth.withSession { api, token in
                try await api.saveContact(name: name, id: contactID, token: token)
            }
            knownContacts[saved.id] = saved
            contactRefreshedAt[saved.id] = .now
            refreshedAt = nil
            if let index = contacts.firstIndex(where: { $0.id == saved.id }) {
                contacts[index] = saved
            } else if contactID == nil {
                contacts.insert(saved, at: 0)
                contacts.sort { $0.createdAt == $1.createdAt ? $0.id > $1.id : $0.createdAt > $1.createdAt }
            }
            isMutating = false
            if !hasLoaded { await refresh(using: auth) }
        } catch {
            isMutating = false
            throw error
        }
    }

    func delete(_ contact: Contact, using auth: AuthStore) async throws {
        try beginMutation()
        do {
            do {
                try await auth.withSession { api, token in try await api.deleteContact(id: contact.id, token: token) }
            } catch AuthAPI.Failure.notFound {
                // A contact removed on another client is already deleted.
            }
            conversations.remove(contactID: contact.id)
            contactRefreshedAt.removeValue(forKey: contact.id)
            refreshedAt = nil
            knownContacts.removeValue(forKey: contact.id)
            contacts.removeAll { $0.id == contact.id }
            isMutating = false
            if !hasLoaded { await refresh(using: auth) }
        } catch {
            isMutating = false
            throw error
        }
    }

    func refreshContact(id: String, using auth: AuthStore, force: Bool = true) async throws {
        if !force, let date = contactRefreshedAt[id], Date().timeIntervalSince(date) < freshness { return }
        guard refreshingContacts.insert(id).inserted else { return }
        defer { refreshingContacts.remove(id) }
        let request = generation
        do {
            let contact = try await auth.withSession { api, token in try await api.contact(id: id, token: token) }
            guard request == generation, !Task.isCancelled else { return }
            knownContacts[id] = contact
            contactRefreshedAt[id] = .now
            if let index = contacts.firstIndex(where: { $0.id == id }) { contacts[index] = contact }
        } catch {
            guard request == generation else { return }
            if case AuthAPI.Failure.notFound = error {
                conversations.remove(contactID: id)
                contactRefreshedAt.removeValue(forKey: id)
                knownContacts.removeValue(forKey: id)
                contacts.removeAll { $0.id == id }
            }
            throw error
        }
    }

    private func beginMutation() throws {
        guard !isMutating else { throw MutationInProgress() }
        generation += 1
        isLoading = false
        isLoadingMore = false
        isMutating = true
        error = nil
    }

    private func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    private struct MutationInProgress: LocalizedError {
        var errorDescription: String? { "Please wait for the current change to finish." }
    }
}
