import AudioToolbox
import UIKit

@MainActor
final class MessageSounds {
    static let shared = MessageSounds()
    var visibleContactID: String?
    private(set) var userID: String?
    private var activeSince: Date?
    private var receivedIDs: Set<String> = []
    private var sentIDs: Set<String> = []
    private var sounds: [String: SystemSoundID] = [:]

    func activate(userID: String?) {
        if self.userID != userID {
            receivedIDs.removeAll()
            sentIDs.removeAll()
            visibleContactID = nil
        }
        self.userID = userID
        if activeSince == nil { activeSince = .now }
    }

    func deactivate() { activeSince = nil }

    func reset() {
        userID = nil
        activeSince = nil
        visibleContactID = nil
        receivedIDs.removeAll()
        sentIDs.removeAll()
    }

    func sent(turnID: String, contactID: String) {
        guard sentIDs.insert(turnID).inserted, visibleContactID == contactID else { return }
        play("mixkit-hard-pop-click-2364")
    }

    func received(turnID: String, contactID: String, userID: String, completedAt: Date,
                  replyIsVisible: Bool = false) {
        guard self.userID == userID, let activeSince,
              UIApplication.shared.applicationState == .active,
              completedAt >= activeSince,
              // A push or list refresh can arrive before chat polling. The visible
              // conversation must wait for its reply bubble to appear instead.
              (visibleContactID != contactID || replyIsVisible),
              receivedIDs.insert(turnID).inserted else { return }
        play(visibleContactID == contactID ? "mixkit-hard-pop-click-2364" : "mixkit-alert-quick-chime-766")
    }

    static func groupConversationID(_ id: String) -> String { "group/\(id)" }

    func canNotify(userID: String, completedAt: Date) -> Bool {
        self.userID == userID && activeSince.map { completedAt >= $0 } == true
            && UIApplication.shared.applicationState == .active
    }

    func sentGroup(messageID: String, groupID: String) {
        sent(turnID: "group/\(messageID)", contactID: Self.groupConversationID(groupID))
    }

    func receivedGroup(messageID: String, groupID: String, userID: String, completedAt: Date, isVisible: Bool = false) {
        received(turnID: "group/\(messageID)", contactID: Self.groupConversationID(groupID), userID: userID,
                 completedAt: completedAt, replyIsVisible: isVisible)
    }

    private func play(_ name: String) {
        guard userID != nil, activeSince != nil, UIApplication.shared.applicationState == .active else { return }
        if sounds[name] == nil {
            guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return }
            var sound: SystemSoundID = 0
            guard AudioServicesCreateSystemSoundID(url as CFURL, &sound) == kAudioServicesNoError else { return }
            sounds[name] = sound
        }
        if let sound = sounds[name] { AudioServicesPlaySystemSound(sound) }
    }
}
