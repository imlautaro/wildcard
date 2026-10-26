import Foundation
import UserNotifications
import Intents

final class NotificationService: UNNotificationServiceExtension, @unchecked Sendable {
    private let lock = NSLock()
    private var handler: ((UNNotificationContent) -> Void)?
    private var original: UNNotificationContent?
    private var work: Task<Void, Never>?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        lock.lock()
        handler = contentHandler
        original = request.content
        lock.unlock()
        let task = Task {
            let content = request.content
            guard let contactID = content.userInfo["contactID"] as? String,
                  let userID = content.userInfo["userID"] as? String else { finish(content); return }
            var avatar: INImage?
            if let address = content.userInfo["photoURL"] as? String,
               let data = try? await downloadPhoto(address) {
                avatar = INImage(imageData: data)
            }
            guard !Task.isCancelled else { finish(content); return }
            let senderID = "\(userID)/\(contactID)"
            let sender = INPerson(personHandle: INPersonHandle(value: senderID, type: .unknown),
                                  nameComponents: nil, displayName: content.title, image: avatar,
                                  contactIdentifier: nil, customIdentifier: senderID)
            let recipient = INPerson(personHandle: INPersonHandle(value: userID, type: .unknown),
                                     nameComponents: nil, displayName: nil, image: nil,
                                     contactIdentifier: nil, customIdentifier: userID, isMe: true)
            let intent = INSendMessageIntent(recipients: [recipient], outgoingMessageType: .outgoingMessageText,
                                            content: content.body, speakableGroupName: nil,
                                            conversationIdentifier: senderID, serviceName: nil,
                                            sender: sender, attachments: nil)
            if let avatar { intent.setImage(avatar, forParameterNamed: \.sender) }
            do {
                let updated = try content.updating(from: intent)
                let interaction = INInteraction(intent: intent, response: nil)
                interaction.direction = .incoming
                // Donation is required by communication notifications. Preserve the original
                // routing data, badge, body, and thread through updating(from:).
                try? await interaction.donate()
                finish(updated)
            } catch { finish(content) }
        }
        lock.lock()
        work = task
        lock.unlock()
    }

    override func serviceExtensionTimeWillExpire() {
        lock.lock()
        let task = work
        let content = original
        lock.unlock()
        task?.cancel()
        if let content { finish(content) }
    }

    private func finish(_ content: UNNotificationContent) {
        lock.lock()
        let callback = handler
        handler = nil
        work = nil
        lock.unlock()
        callback?(content)
    }

    private func downloadPhoto(_ address: String) async throws -> Data {
        guard let url = URL(string: address),
              let configured = Bundle.main.object(forInfoDictionaryKey: "WildcardAPIURL") as? String,
              let origin = URL(string: configured), url.scheme == "https",
              url.host == origin.host, url.port == origin.port,
              url.user == nil, url.password == nil,
              url.path.hasPrefix("/api/v1/push-photos/") else { throw URLError(.badURL) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 15
        let session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(from: url)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200,
              response.mimeType == "image/jpeg", response.expectedContentLength <= 512 * 1024 else {
            throw URLError(.badServerResponse)
        }
        var data = Data()
        for try await byte in bytes {
            guard data.count < 512 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        return data
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
