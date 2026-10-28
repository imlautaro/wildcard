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
