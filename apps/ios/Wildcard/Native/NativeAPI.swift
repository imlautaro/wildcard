import Foundation

struct NativeContext: Encodable, Sendable {
    let deviceID: String
    let kinds: [String]
    var automaticKinds: [String]? = nil
}
struct NativePayload: Codable, Sendable {
    let kind: String
    let title: String
    var body: String?
    var durationSeconds: Int?
    var date: String?
    var endDate: String?
    var steps: [String]?
    var latitude: Double?
    var longitude: Double?
    var radius: Double?
    var trigger: String?
}
struct NativeAction: Decodable, Identifiable, Sendable {
    let id: String
    let turnID: String
    let kind: String
    let payloadJSON: String
    let status: String
    let executionID: String?
    let remoteDeviceID: String?
    let createdAt: Double
    let updatedAt: Double
    let expiresAt: Double
    var payload: NativePayload? { try? JSONDecoder().decode(NativePayload.self, from: Data(payloadJSON.utf8)) }
}
extension AuthAPI {
    private struct NativeEnvelope: Decodable { let actions: [NativeAction] }
    private struct NativeMutationEnvelope: Decodable { let action: NativeAction }
    private struct NativeMutation: Encodable { let executionID: String; let status: String }
    func nativeActions(contactID: String, deviceID: String, token: String) async throws -> [NativeAction] {
        let (data, _) = try await send(path: "contacts/\(contactID)/native-actions", token: token,
                                     query: [URLQueryItem(name: "deviceID", value: deviceID)])
        return try JSONDecoder().decode(NativeEnvelope.self, from: data).actions
    }
    func nativeAction(contactID: String, actionID: String, deviceID: String, executionID: String, status: String, token: String) async throws -> NativeAction {
        let body = try JSONEncoder().encode(NativeMutation(executionID: executionID, status: status))
        let (data, _) = try await send(path: "contacts/\(contactID)/native-actions/\(actionID)", method: "POST", body: body, token: token,
                                     query: [URLQueryItem(name: "deviceID", value: deviceID)])
        return try JSONDecoder().decode(NativeMutationEnvelope.self, from: data).action
    }
}

struct RemoteNativeDevice: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let owned: Int
}
struct RemoteNativeParticipant: Decodable, Identifiable, Sendable { let id: String; let name: String }
struct RemoteNativeDelegation: Decodable, Sendable { let id: String; let deviceID: String; let participantID: String }
struct RemoteNativeReceipt: Decodable, Identifiable, Sendable {
    let id: String; let turnID: String; let kind: String; let title: String
    let deviceName: String; let status: String; let updatedAt: Double; let fireAt: Double
}
struct RemoteNativeSnapshot: Decodable, Sendable {
    let devices: [RemoteNativeDevice]
    let participants: [RemoteNativeParticipant]
    var delegations: [RemoteNativeDelegation]
    let actions: [RemoteNativeReceipt]
    var fetchedAt = Date.now
    private enum CodingKeys: String, CodingKey { case devices, participants, delegations, actions }
}

@MainActor extension ContactsStore {
    func refreshRemote(contactID: String, using auth: AuthStore, force: Bool = false) async throws {
        let snapshot = remoteSnapshots.store(for: contactID)
        if !force, let value = snapshot.value, Date.now.timeIntervalSince(value.fetchedAt) < 5 { return }
        let owner = auth.user?.id
        do {
            try await snapshot.refresh {
                let value = try await auth.withSession { api, token in
                    let (data, _) = try await api.send(path: "contacts/\(contactID)/native-remote", token: token)
                    return try JSONDecoder().decode(RemoteNativeSnapshot.self, from: data)
                }
                guard owner == auth.user?.id else { throw CancellationError() }
                return value
            }
        } catch {
            if case AuthAPI.Failure.notFound = error { remoteSnapshots.remove(id: contactID) }
            if case AuthAPI.Failure.unauthorized = error { remoteSnapshots.remove(id: contactID) }
            if case AuthAPI.Failure.rejected("Contact consent required") = error { remoteSnapshots.remove(id: contactID) }
            throw error
        }
    }
    func setRemoteDelegate(contactID: String, deviceID: String, participantID: String, allowed: Bool, using auth: AuthStore) async throws {
        guard !remoteMutating.contains(contactID) else { return }
        remoteMutating.insert(contactID)
        defer { remoteMutating.remove(contactID) }
        let owner = auth.user?.id
        let snapshot = remoteSnapshots.store(for: contactID)
        _ = try await auth.withSession { api, token in
            try await api.send(path: "contacts/\(contactID)/native-remote/\(deviceID)/participants/\(participantID)", method: allowed ? "PUT" : "DELETE", token: token)
        }
        guard owner == auth.user?.id else { throw CancellationError() }
        if var value = snapshot.value {
            value.delegations.removeAll { $0.deviceID == deviceID && $0.participantID == participantID }
            if allowed { value.delegations.append(RemoteNativeDelegation(id: "pending-refresh", deviceID: deviceID, participantID: participantID)) }
            snapshot.replace(value)
        }
        try await refreshRemote(contactID: contactID, using: auth, force: true)
    }
}
