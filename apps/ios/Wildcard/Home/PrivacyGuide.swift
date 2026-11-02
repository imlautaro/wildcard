import SwiftUI

/// Plain-language privacy rules (docs/privacy.md). The copy matches the web account page.
enum PrivacyGuide {
    static var contactsShareInfo: String { String(localized: "Your contacts can recall what you told any of the others and ask each other, in your private chats, without linking them one by one. Groups and other people are not affected. Chats you keep private and chats with connections stay out.") }

    static func keepPrivateInfo(contactName: String?) -> String {
        let name = contactName ?? String(localized: "this contact")
        return String(localized: "What you tell \(name) stays in this chat. It is not used in groups, by people this contact is shared with, by your other contacts or in For you, and this chat cannot be linked or discussed in a group. Things you explicitly ask it to send or post still go where you ask.")
    }

    static var rules: [(title: String, text: String)] { [
        (String(localized: "Your private chats"), String(localized: "A contact remembers facts from your chat, never the whole conversation. Those facts can be used in your chats with it, in groups where you are both members, and by people you share that contact with.")),
        (String(localized: "Groups"), String(localized: "What is said in a group is used only in that group and in private chats with people who are in it. Contacts never carry one group's conversation into another group.")),
        (String(localized: "Keep this chat private"), String(localized: "Set in each contact’s details. What you tell that contact stays in that chat: not in groups, not with people you share it with, not with your other contacts and not in For you.")),
        (String(localized: "Contacts share with each other"), String(localized: "Set here. Your own contacts pool what they know about you in your private chats and can ask each other. Off by default.")),
        (String(localized: "Always private"), String(localized: "Whole chat transcripts, files and schedules are never shared, unless you turn on Discuss my private chats for one contact in one group. Chats with connections never leave their chat.")),
        (String(localized: "For you"), String(localized: "Built only from your own chats and seen only by you. Chats you keep private are left out.")),
    ] }
}

struct PrivacyGuideSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(PrivacyGuide.rules, id: \.title) { rule in
                VStack(alignment: .leading, spacing: 4) {
                    Text(rule.title).font(.headline)
                    Text(rule.text).font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            .navigationTitle("How privacy works")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}
