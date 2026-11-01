# Chat JSON export

A person can download one private chat or one group as a readable JSON transcript.
On iOS and the web the action is **Export chat** on the chat's details screen
(contact details, or group details). A confirmation explains what the file contains;
**Export JSON** (iOS) or **Download JSON** (web) starts it. The web saves the file
through the browser; iOS opens the share sheet (Save to Files, AirDrop, Mail…).
Nothing is sent to an AI. This is separate from the account-wide
[debug export](debug-export.md), which keeps raw rows and internals for debugging.

## Contents (format `wildcard-chat-export`, schema version 1)

```json
{
  "format": "wildcard-chat-export", "schemaVersion": 1, "exportedAt": "2026-11-01T12:00:00.000Z",
  "chat": { "kind": "private", "id": "…", "name": "Ana" },
  "participants": [{ "kind": "user", "id": "…", "name": "Sam" }, { "kind": "contact", "id": "…", "name": "Ana" }],
  "notes": ["Times are ISO 8601 in UTC.", "…"],
  "messageCount": 2,
  "messages": [{
    "id": "…", "turnID": "…", "side": "user", "sentAt": "2026-11-01T11:58:00.000Z",
    "sender": { "kind": "user", "id": "…", "name": "Sam" }, "text": "Hi",
    "voice": null, "attachments": [], "replyTo": null,
    "reactions": [{ "emoji": "❤️", "by": { "kind": "contact", "id": "…", "name": "Ana" } }]
  }]
}
```

- `sender.kind` is `user` (a person), `contact` (an AI contact, by agent ID) or
  `system` (group membership notices, which also carry `event`).
- Names are what the exporting person reads: their private contact aliases apply.
- `voice` is `{ durationMs, transcript }`. A contact's voice message keeps its text
  as transcript. A person's voice transcript is included only once it was revealed
  (`voice_transcribed_at`), as in the chat views.
- `attachments` list `name`, `mimeType`, `size` and, for stickers, `sticker`.
  File, image and audio bytes are never included. Albums list every image.
- Private chats: each turn yields the person's message (`side: "user"`, absent for
  scheduled turns, as in the chat views) and each contact message (`side: "assistant"`).
  `replyTo` is `{ messageID, side }` where `messageID` is a `turnID`. Private reactions
  target a whole reply turn and are listed on its first contact message. A person's
  message whose reply failed has `status: "failed"` (not batched messages that a later
  reply answered, which the chat views also show as complete). Messages are ordered by time,
  as rendered, because a reply can arrive after a later human message.
- Groups: messages since this member's history start, excluding task work messages,
  ordered by sequence, exactly as `GET /groups/:id/messages` shows them. `replyTo`
  is `{ messageID }`. The file contains every member's messages that this person can
  read; the confirmation says so.
- Excluded: raw `*_json` fields, workflow IDs, reply attempts/error codes, storage
  keys, memory, tasks, documents, mini apps, schedules and media bytes. Use the
  debug export for internals.

## API, authorization and limits

- `GET /api/v1/contacts/:id/chat/export` — the private chat router's ownership check.
- `GET /api/v1/groups/:id/export` — after the group membership middleware.

Both are built by `apps/api/src/chat/export.ts` with server-owned SQL. The server
reads history in pages of 100 rows by sequence, plus reactions per page, and returns
one `application/json` document. It returns 409 while the chat is being cleared or
if `history_revision` (or group membership) changed during the export, 404 without
access, 413 once the encoded messages exceed 20 MB (the document is assembled in
Worker memory so failures still return an error status instead of a truncated file),
and 429 after 6 exports per account per minute (`admitAuthRequest`, key
`chat-export`). This is a live read, **not an atomic snapshot**: a message can
change status while the export runs.

## Clients and caching

Exports bypass conversation caches by design: they must include unloaded history and
must not keep a second copy of private conversations. There is no automatic refresh,
background retry or disk cache; every retry starts fresh and failures leave the
conversation caches untouched.

- **Web** (`useChatExport`, `ChatExportAction.vue` inside `ChatLifecycleActions`):
  one session-owned export at a time; closing the sheet, leaving the details page,
  sign-out or an account switch aborts the request and drops late responses. The
  response is pretty-printed into a Blob, saved as
  `wildcard-chat-<name>-<yyyy-mm-dd>.json`, and its object URL is revoked.
- **iOS** (`Chat/ChatExport.swift`, rows in `ContactEditorView` and
  `GroupMembersView`): the request uses `AuthStore.withSession` with a 120 s timeout,
  drops responses after sign-out or account change, validates the JSON, pretty-prints
  it (keys sorted) and writes one file to `tmp/ChatExports` with complete file
  protection. The file is deleted when the share sheet closes and before the next
  export. If the screen is left mid-export, the request finishes in the background
  and its file stays in `tmp/ChatExports` until the next export or the system purges
  temporary files.

## Setup and verification

Uses existing D1, API authentication, the web API proxy and iOS networking. No new
resources, secrets, migrations or permissions. Release through committed, pushed
source and automatic deployments only; rollback removes the routes/UI with no data
to migrate.

Verified statically on 2026-11-01: API and web type checks, the iOS `swiftc
-typecheck`, and `EXPLAIN` of every export query on local workerd D1 with all
migrations applied. Not yet verified at runtime (browser or device): with fictional
data, export a private chat over 100 turns (several pages, ideally thousands) with voice, images, an album, a sticker,
replies, reactions and a scheduled turn; a group with membership notices, a member
who joined without history and task work; an empty chat; an archived chat. Check
the 409 during clear, 413 on a very large chat, 429 after repeated exports, cancel
on web, leaving the screen, sign-out mid-export, the iOS share sheet targets and
that the temporary file is removed after the sheet closes.
