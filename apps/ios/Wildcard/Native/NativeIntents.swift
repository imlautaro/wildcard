import AppIntents
import Foundation

struct WildcardContactEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Wildcard contact")
    static var defaultQuery = WildcardContactQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}
struct WildcardContactQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [WildcardContactEntity] {
        (NativeShared.directory?.contacts ?? []).filter { identifiers.contains($0.id) }.map { WildcardContactEntity(id: $0.id, name: $0.name) }
    }
    func suggestedEntities() async throws -> [WildcardContactEntity] {
        (NativeShared.directory?.contacts ?? []).map { WildcardContactEntity(id: $0.id, name: $0.name) }
    }
}
struct OpenWildcardContactIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Wildcard contact"
    static var description = IntentDescription("Open a contact you enabled in Native experiments.")
    static var openAppWhenRun = true
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
    @Parameter(title: "Contact") var contact: WildcardContactEntity
    static var parameterSummary: some ParameterSummary { Summary("Open \(\.$contact)") }
    @MainActor func perform() async throws -> some IntentResult {
        guard NativeShared.directory?.contacts.contains(where: { $0.id == contact.id }) == true else { throw CocoaError(.fileReadNoPermission) }
        NativeExperiments.shared.route = .init(contactID: contact.id, agentID: nil)
        return .result()
    }
}
struct DraftWildcardMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "Draft a message to Wildcard"
    static var description = IntentDescription("Prepare a message for review in Wildcard. Nothing is sent until you tap Send.")
    static var openAppWhenRun = true
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
    @Parameter(title: "Contact") var contact: WildcardContactEntity
    @Parameter(title: "Message") var text: String
    static var parameterSummary: some ParameterSummary { Summary("Draft \(\.$text) to \(\.$contact)") }
    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let directory = NativeShared.directory, directory.contacts.contains(where: { $0.id == contact.id }) else { throw CocoaError(.fileReadNoPermission) }
        let draft = NativeDraft(userID: directory.userID, contactID: contact.id, text: text)
        try NativeShared.enqueue(draft)
        NativeExperiments.shared.route = .init(contactID: contact.id, agentID: nil, draftID: draft.id)
        return .result(dialog: "Your draft is ready to review in Wildcard.")
    }
}
struct WildcardShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenWildcardContactIntent(), phrases: ["Open a contact in \(.applicationName)"], shortTitle: "Open contact", systemImageName: "person.crop.circle")
        AppShortcut(intent: DraftWildcardMessageIntent(), phrases: ["Draft a message in \(.applicationName)"], shortTitle: "Draft message", systemImageName: "square.and.pencil")
    }
}
