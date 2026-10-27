import Foundation

/// Session-owned work: view cancellation must not abandon an observed read.
/// The highest observed watermark wins, including observations during a request.
@MainActor
final class ReadAcknowledgementQueue {
    private struct Pending {
        var sequence: Int
        let acknowledge: @MainActor (Int) async throws -> Int
    }
    private var pending: [String: Pending] = [:]
    private var requests: [String: (id: UUID, task: Task<Void, Never>)] = [:]

    @discardableResult
    func enqueue(id: String, sequence: Int, confirmed: Int,
                 acknowledge: @escaping @MainActor (Int) async throws -> Int) -> Task<Void, Never>? {
        guard sequence > confirmed else { return requests[id]?.task }
        if var existing = pending[id] {
            existing.sequence = max(existing.sequence, sequence)
            pending[id] = existing
        } else {
            pending[id] = Pending(sequence: sequence, acknowledge: acknowledge)
        }
        return start(id: id)
    }

    func retryPending() {
        for id in Array(pending.keys) { _ = start(id: id) }
    }

    func remove(id: String) {
        pending.removeValue(forKey: id)
        requests.removeValue(forKey: id)?.task.cancel()
    }

    private func start(id: String) -> Task<Void, Never>? {
        if let request = requests[id] { return request.task }
        guard pending[id] != nil else { return nil }
        let identity = UUID()
        let task = Task {
            defer { if self.requests[id]?.id == identity { self.requests.removeValue(forKey: id) } }
            while !Task.isCancelled, let submitted = self.pending[id] {
                do {
                    let confirmed = try await submitted.acknowledge(submitted.sequence)
                    guard !Task.isCancelled, self.requests[id]?.id == identity,
                          let latest = self.pending[id] else { return }
                    if confirmed >= latest.sequence {
                        self.pending.removeValue(forKey: id)
                        return
                    }
                    // A newer observation arrived during the write. Send it next.
                    // A partial acknowledgement retries on the next session tick.
                    if confirmed < submitted.sequence { return }
                } catch {
                    // Keep the intent across navigation and transient failures.
                    return
                }
            }
        }
        requests[id] = (identity, task)
        return task
    }
}
