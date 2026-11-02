import Foundation

/// One contact's live activity in a group, as sent in `replyActivityEntries`.
struct ReplyActivityEntry: Decodable, Hashable {
    let name: String
    let activity: String
}

/// The chat-list activity line for a group, worded in the app language. It follows
/// the rules of the API's English `replyActivity` (shared/activity.ts): unique names,
/// one clause per activity in first-seen order, and "N people are typing..." once
/// more than three names, or a line longer than 48 characters, would not fit.
/// The web builds the same line (useReplyActivityLabel.ts). docs/localization.md.
enum ReplyActivityLabel {
    private static let maxNames = 3
    private static let maxLength = 48

    static func localized(_ entries: [ReplyActivityEntry]) -> String? {
        var unique: [ReplyActivityEntry] = []
        for entry in entries where !unique.contains(where: { $0.name == entry.name }) { unique.append(entry) }
        guard !unique.isEmpty else { return nil }
        var activities: [String] = []
        for entry in unique where !activities.contains(normalized(entry.activity)) { activities.append(normalized(entry.activity)) }
        let clauses = activities.map { activity in
            clause(activity, names: unique.filter { normalized($0.activity) == activity }.map(\.name))
        }
        let named = clauses.joined(separator: ", ")
        if unique.count == 1 || (unique.count <= maxNames && named.count + 3 <= maxLength) {
            return named + "..."
        }
        return people(unique.count, activity: activities.count == 1 ? activities[0] : "replying")
    }

    private static func normalized(_ activity: String) -> String {
        activity == "recording" || activity == "researching" ? activity : "typing"
    }

    private static func clause(_ activity: String, names: [String]) -> String {
        let list = names.formatted(.list(type: .and))
        let single = names.count == 1
        switch activity {
        case "recording": return single ? String(localized: "\(list) is recording") : String(localized: "\(list) are recording")
        case "researching": return single ? String(localized: "\(list) is researching") : String(localized: "\(list) are researching")
        default: return single ? String(localized: "\(list) is typing") : String(localized: "\(list) are typing")
        }
    }

    private static func people(_ count: Int, activity: String) -> String {
        switch activity {
        case "recording": return String(localized: "\(count) people are recording...")
        case "researching": return String(localized: "\(count) people are researching...")
        case "replying": return String(localized: "\(count) people are replying...")
        default: return String(localized: "\(count) people are typing...")
        }
    }
}

/// The API words a few chat-list previews itself, in English, inside the same
/// `lastMessageText` / `lastMessagePreview` field as real message text. Clients
/// translate exactly those fixed labels at display time and pass anything else
/// through (text a person literally typed that equals a label is also translated,
/// which only affects the preview). The web does the same (utils/serverPreview.ts).
enum ServerPreviewText {
    static func localized(_ text: String) -> String {
        switch text {
        case "Voice message": return String(localized: "Voice message")
        case "Scheduled message": return String(localized: "Scheduled message")
        case "Group response": return String(localized: "Group response")
        case "Working on a task": return String(localized: "Working on a task")
        default: break
        }
        if text.hasSuffix(" photos"), let count = Int(text.dropLast(7)) { return String(localized: "\(count) photos") }
        if text.hasPrefix("Sticker ") {
            let emoji = String(text.dropFirst(8))
            if !emoji.isEmpty, !emoji.contains(where: \.isWhitespace) { return String(localized: "Sticker \(emoji)") }
        }
        if text.hasPrefix("Attachment: ") { return String(localized: "Attachment: \(String(text.dropFirst(12)))") }
        return text
    }
}
