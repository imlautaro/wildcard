import Foundation
import Observation

/// Receipt evidence only advances for a particular immutable message ID.
enum ReceiptProgress {
    static func merge(_ current: String?, _ incoming: String?) -> String? {
        let rank = ["sent": 0, "received": 1, "read": 2]
        guard let incoming else { return current }
        guard let current else { return incoming }
        return (rank[incoming] ?? -1) >= (rank[current] ?? -1) ? incoming : current
    }
}

/// One foreground synchronization owner per signed-in shell. Events coalesce without
/// canceling an in-flight read; a wake received during a read gets the next pass.
@MainActor @Observable
final class ConversationSync {
    var visible: PushNotifications.Conversation?
    private var contactWake: AsyncStream<Void>.Continuation?
    private var groupWake: AsyncStream<Void>.Continuation?
    private var runID: UUID?
    private var historyRequests: [String: (id: UUID, task: Task<Void, Never>)] = [:]

    private func refreshHistory(key: String, operation: @escaping @MainActor () async -> Void) {
        guard historyRequests[key] == nil else { return }
        let id = UUID()
        let task = Task {
            await operation()
            if self.historyRequests[key]?.id == id { self.historyRequests.removeValue(forKey: key) }
        }
        historyRequests[key] = (id, task)
    }
    private var requestedContacts: Set<String> = []
    private var requestedGroups: Set<String> = []

    func request(_ conversation: PushNotifications.Conversation? = nil) {
        switch conversation {
        case .contact(let id): requestedContacts.insert(id); contactWake?.yield(())
        case .group(let id): requestedGroups.insert(id); groupWake?.yield(())
        case nil: contactWake?.yield(()); groupWake?.yield(())
        }
    }

    func run(contacts: ContactsStore, groups: GroupsStore, auth: AuthStore) async {
        guard let accountID = auth.user?.id else { return }
        let currentRun = UUID()
        runID = currentRun
        let contactEvents = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let groupEvents = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        contactWake = contactEvents.continuation
        groupWake = groupEvents.continuation
        defer {
            contactEvents.continuation.finish()
            groupEvents.continuation.finish()
            if runID == currentRun {
                contactWake = nil
                groupWake = nil
                runID = nil
            }
        }
        contacts.retryPendingReads()
        groups.retryPendingReads()
        request()
        await withTaskGroup(of: Void.self) { tasks in
            tasks.addTask { @MainActor in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(1)) } catch { return }
                    guard self.runID == currentRun else { return }
                    contacts.retryPendingReads()
                    groups.retryPendingReads()
                    self.request()
                }
            }
            tasks.addTask { @MainActor in
                for await _ in contactEvents.stream {
                    guard !Task.isCancelled, self.runID == currentRun, auth.state == .signedIn, auth.user?.id == accountID else { return }
                    var ids = self.requestedContacts
                    self.requestedContacts.removeAll()
                    if case .contact(let id) = self.visible { ids.insert(id) }
                    async let list: Void = contacts.refresh(using: auth, preserveLoadedPages: true)
                    for id in ids {
                        let chat = contacts.conversations.store(for: id)
                        self.refreshHistory(key: "contact/" + id) {
                            guard auth.user?.id == accountID else { return }
                            await chat.refresh(contactID: id, using: auth)
                        }
                    }
                    await list
                }
            }
            tasks.addTask { @MainActor in
                for await _ in groupEvents.stream {
                    guard !Task.isCancelled, self.runID == currentRun, auth.state == .signedIn, auth.user?.id == accountID else { return }
                    var ids = self.requestedGroups
                    self.requestedGroups.removeAll()
                    if case .group(let id) = self.visible { ids.insert(id) }
                    async let list: Void = groups.refresh(using: auth, refreshInvitations: false)
                    for id in ids {
                        let chat = groups.conversations.store(for: id)
                        self.refreshHistory(key: "group/" + id) {
                            guard auth.user?.id == accountID else { return }
                            await chat.refresh(id: id, auth: auth)
                        }
                    }
                    await list
                }
            }
            await tasks.waitForAll()
        }
    }
}
