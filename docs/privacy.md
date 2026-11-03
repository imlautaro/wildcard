# Privacy: what contacts can share, and where

This guide is the single reference for how information moves between private chats,
shared contacts, groups, linked contacts and For you. It covers the audit of
2026-11-01, the rules the API enforces, the two user controls and how they were
verified. Feature guides keep their details; this page explains how they fit together.

## The rules in one screen

A contact never shares a whole conversation. It shares **facts** it extracted
(`contact_memory`, `group_memory`, each with a source quote), plus what a person
explicitly asks it to send or post. Raw transcripts, files and schedules only cross a
chat boundary through an explicit per-group grant ("Discuss my private chats").

| What | Default audience | Never reaches |
| --- | --- | --- |
| Facts from your private chat with contact X | Your chats with X; groups where **you** and X are both members; private chats of people you share X with | Groups you are not in; your other contacts (unless "Contacts share with each other"); For you when the chat is private |
| Facts from what you said in group G | G itself; private chats with X of people who are members of G (from when they could read) | Other groups; private chats of people outside G |
| Your raw private messages | Only your chat | Anywhere, unless you grant one contact in one group "Discuss my private chats" |
| Facts told in confidence (surprise, gift, "don't tell X", a complaint about someone) | Only the chat they were told in | Everyone else, whatever the settings ([Discretion](#discretion)) |
| Connector (MCP) chats and their facts | Only that chat | Groups, shared participants, linked contacts, For you |
| For you cards and comments | Only you | Other people |

Two controls change this, both on iOS and the web:

- **Keep this chat private** (contact details, per person and contact, off by default).
  Your facts from that chat stay in that chat: not in groups, not in other participants'
  chats with a shared contact, not pooled to your other contacts, not in For you. The chat
  cannot be linked and cannot be granted with "Discuss my private chats" (turning it on
  removes existing grants). Each participant of a shared contact decides for their own chat.
- **Contacts share with each other** (account → Privacy, off by default). In your private
  chats, every contact can recall what you told your other contacts and ask them
  (`ask_linked_contact` / `tell_linked_contact`), as if every pair were linked. It pools
  only **your own** facts, only in **your private chats**. Groups and other people see
  nothing new. Private chats and connector chats neither give nor receive.

Account → Privacy → **How privacy works** shows the same rules in plain language.

"Discuss my private chats" being off does **not** mean a contact never mentions anything
from your private chat in that group: the facts above still reach groups you are both in.
The switch adds raw message search and quoting. The group sheet says so in a visible note
(2026-11-03, after a user expected silence with the switch off); "Keep this chat private"
is the switch that keeps facts out.

Things a person explicitly asks for are not blocked by these settings: posting in a group
(`send_group_message`), relaying to a shared-contact participant (`send_private_message`),
scheduling for another participant, or adding a topic to For you. The person decided.

## Audit (2026-11-01)

Each row is a scenario the product allows, what flows, the gate in code, and the result.
"Fixed" rows were real leaks before this change; regression tests cover them.

| # | Scenario | What can flow | Gate | Status |
| --- | --- | --- | --- | --- |
| 1 | Contact A ↔ contact B of the same person (private) | Nothing by default. With a link or "Contacts share with each other": facts and on-demand answers | `readMemories` pooling branch (`chat/memory.ts` `memoryAudience`), `readLinks` (`contacts/links.ts`) | By design; new opt-in |
| 2 | Shared contact X: owner U ↔ participant V | U's facts in V's chat and vice versa (consented at invitation/acceptance). Never transcripts, files, schedules | `readMemories` same-agent branch; `keep_private` per participant | By design; now controllable per person |
| 3 | V's private facts in a group V is **not** in (U added X to group G2) | Previously: yes, every participant's facts reached any group with X | `readMemories` with `groupID`: source must be a member of that group | **Fixed** |
| 4 | Group G2 facts in V's private chat with shared X (V not in G2) | Previously: yes | `groupMemories(..., { readerID })` requires reader membership and history floor | **Fixed** |
| 5 | Group G1 facts in group G2 (X in both) | Previously: yes, including `search_group_memories` | `groupMemories(..., { groupID })` | **Fixed** |
| 6 | Your private facts in a group you are in | Yes, unless that chat is private or the fact is confidential. Raw text only with "Discuss my private chats" | `readMemories` + `groups/private-sharing.ts` | By design; now controllable |
| 7 | What you said in a group, in your private chat with X | Yes (you were there) | `groupMemories` reader membership | By design |
| 8 | Raw group history in a private chat | Only groups both you and X are in, from your history floor | `groups/retrieval.ts` (`sharedGroups`, `searchGroupMessages`) | By design (verified unchanged) |
| 9 | Group → private message (`message_privately`) | One message to a member who already has a chat with X; private memories not consulted | `groups/private-messages.ts` | By design |
| 10 | Private → group post (`send_group_message`, `ask_agent_in_group`) | Only on the person's explicit request, separately authorized | `docs/group-requests.md` | By design |
| 11 | Relay to a shared-contact participant | Only the requested text/image, on explicit request | `chat/private-relay.ts` | By design |
| 12 | Linked contacts | The linked contact answers from its facts about this person, its chat with them and groups both are in | `contacts/links.ts`; private chats excluded | By design; private chats now excluded |
| 13 | For you | Only the person's own rows (`home/signals.ts`), never other people's facts; visible only to them | `readSignals`; private chats and connector chats excluded; reviews skip private chats (`home/review.ts`) | By design; private chats now excluded |
| 14 | For you comments → private chat | Only comments on posts written by that same contact | `home/comments.ts` `updatesDiscussion` | By design |
| 15 | Agent self-memory (persona) | The contact's own preferences, across all its audiences | `chat/agent-memory.ts`; extraction excludes human facts | Residual risk (see below) |
| 16 | Personality / relationship continuity | Tone only, never causes or facts | `personality/director.ts` instructions | By design |
| 17 | Conversation learning | Per audience; never exported | `chat/learning.ts` | By design |
| 18 | Web research results | Same conversation only | `research/context.ts` | By design |
| 19 | Photos and image search | Same conversation only | `photos/chat-images.ts` | By design; group search ignores a contact's history floor (minor, open) |
| 20 | Connector (MCP) chats | Local memory only; excluded from sharing, links, groups, For you | `mcp_private_contact` / `mcp_private_group` checks | By design |
| 21 | Group history for late joiners | Readable from join unless "Can see earlier messages" | `groups/history-access.ts` | By design |
| 22 | Chat export / debug export | Only what that account can read (own chat; group membership and history floor) | `chat/export.ts` (a parallel, uncommitted change), `routes/debug-export.ts` | By design |
| 23 | Spontaneous-message subjects across your contacts | Only a fixed subject label and count (for example `music` ×2) from the last 48 hours, so contacts avoid opening the same subject; never text, names or facts. `follow-up` is not shared | `chat/initiative.ts` (`otherContactsRecentTopics`); private and connector chats neither give nor receive | By design (2026-11-03, [Topic variety](initiative.md#topic-variety)) |

## Discretion

Sharing a contact (or adding it to a group) means shared memory, but a friend who knows two
people still keeps a surprise party secret and still warns you that the other person goes to
bed early tonight. Two layers implement that (2026-11-03):

1. **Classification at storage (hard gate).** Memory extraction (`maintainMemories`,
   `chat/memory.ts`) marks each fact `confidential` when the author would not want it
   repeated: they ask to keep it secret or not to tell someone; it is a surprise, gift or plan
   hidden from someone; it is a complaint or private judgment about another person; or it is
   said in confidence. `memoryAudience` only reads a confidential fact in its own chat, so it
   never reaches other participants of a shared contact, groups, or pooled contacts. When the
   author says the secret is out, extraction upserts the same key with `confidential` false.
   A clear that keeps memories copies the flag into `retained_contact_memory`. Migration
   `0099_confidential_memory.sql` (existing facts default to shareable, as before).
2. **Judgment at reply time (soft layer).** `discretionInstruction` (private chats and groups):
   mention another person's fact briefly when it directly bears on the request (busy, going to
   bed early, traveling, a conflicting plan); do not volunteer unrelated facts; never reveal or
   hint at a surprise, gift, secret, confidence or complaint about the speaker even if it is in
   memory, and do not say there is something it cannot tell.

Extraction also stores near-term plans and availability as `pending` with their date. Before,
"transient remarks" were excluded, so "I'm going to bed early tonight" was never stored and
the other participant's contact could not know it.

Checked with `scripts/checks/shared-memory-discretion-live-eval.mjs` (fictional Alice and Bob
sharing one contact; real extraction, then Bob's reply) on `muse-spark-1.3-contributor`.
Baseline: the early-bedtime fact was not extracted and Bob's contact did not mention it (0/1
private, 0/2 group); a gift question was answered with "what each person tells me privately
stays private", which hints that a secret exists. After: 22/22 across 11 scenarios × 2
(early-bedtime conflict in private and group, surprise party in private and group, surprise
stored as shareable on purpose, explicit "don't tell Bob", gift, sushi preference, unrelated
question without dumping facts, secret revealed later, complaint about Bob). The
`isolation:` test covers the gate, including retained memories; removing the gate fails it.

Limits: classification is model-based and can be wrong in either direction (the reply-time
layer is the backstop for facts stored as shareable). Confidential is all-or-nothing: a
surprise for Bob is also hidden from a third participant who is helping plan it. A fact
first stored as shareable and only later marked confidential could have been read in between.

### Residual risks and open items

- **Persona memory is shared across audiences.** A contact's own preferences (for example
  "my favorite color is blue") follow it into every chat and group. Extraction is told to
  exclude human facts, secrets and relationship assessments, but it is model-based and
  fallible. A private chat does not move persona memory to a local store (connector chats do).
- **Facts are model-extracted.** A fact can be worded more broadly than the source quote.
  The source quote travels with it.
- **Already-sent replies are not recalled.** Changing a setting affects the next read; it does
  not retract messages, notifications or provider requests that already happened.
- **`memory_shared` stays on** once a contact was shared or added to a group. With these rules
  it no longer exposes anything by itself (every read also checks the audience), so it is left
  as is.
- **Group image search** (`search_chat_images` in a group) does not apply a contact's
  "added without earlier messages" floor. Minor; not changed here.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| PUT | `/api/v1/me/privacy` | `{ "contactsShare": boolean }` | `{ user }` with `contactsShare` |
| PUT | `/api/v1/contacts/:id/privacy` | `{ "keepPrivate": boolean }` | `{ contact }` with `keepPrivate` (0/1) |

`GET /me` and every contact response include the fields. `GET /contacts/:id/links` adds
`allContacts` (true while "Contacts share with each other" is on); its `links` list only
the explicit links, which stay if the setting is turned off. Only the session's own rows can
change; another participant's contact ID returns 404.

Migration `0093_privacy_controls.sql` adds `user.contacts_share` and `contact.keep_private`
(both `0`), plus a trigger that deletes the chat's `group_private_sharing` grants when it
becomes private (the existing delete trigger completes pending group replies). Existing
accounts keep today's behavior except for the three fixed leaks.

## Clients and cache

- **Web**: Account → Privacy (switch + "How privacy works" sheet), contact details →
  "Keep this chat private", a notice on Linked contacts, and the "Discuss my private chats"
  sheet says why a contact is unavailable. `useSession.savePrivacy` and
  `useChats.setKeepPrivate` apply the server response and drop every linked-contacts
  snapshot (`invalidateContactLinks`).
- **iOS**: the same rows in `AccountView` (`PrivacyGuide.swift` holds the shared copy) and
  `ContactEditorView`; `ContactsStore.setKeepPrivate` and the account toggle clear
  `linkSnapshots`. Group details revalidate in the background as before; cached switches
  never authorize anything.
- Consent texts for group creation, invitations, adding a contact and shared-contact
  invitations now describe these rules.

## Verification

- `npm run test:memory-isolation` (apps/api, local workerd D1, fictional data): 7 tests,
  including four new ones: a group only hears its members' facts and its own group memories;
  a private chat only recalls groups its person is in; "Keep this chat private" (API route,
  trigger, other participant, groups, turning it back off); "Contacts share with each other"
  (pooling, attribution, implicit links, no reach into groups or other people, private and
  connector chats excluded). Reverting the group-memory scope makes the first two fail with
  `LEAK:` messages; reverting only the group-membership check in `readMemories` fails the first
  one on the shared-contact member's fact.
- `npm run test:lifecycle`: 48 of 48. API TypeScript, `typecheck:lifecycle`, web
  `npm run typecheck` and the static iOS `swiftc -typecheck` pass.
- Not verified: live model behavior (whether a contact phrases pooled facts well, whether it
  volunteers group facts in the right chats), device/browser rendering of the new rows.
