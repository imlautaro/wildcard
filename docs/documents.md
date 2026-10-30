# Chat documents

Contacts and people can keep **Markdown documents** in any chat: plans, reports,
notes, drafts. In a private chat they belong to that participant's chat with the
contact; in a group every member and group contact can read and edit them, so
several contacts can write one document together. Documents open full screen like
mini apps, with a Markdown viewer and an editor.

[Web research](web-research.md) creates sourced reports in these same documents
when a lasting deliverable was requested. Conversational background research uses
its findings directly in chat and does not create a document or card.
Both clients label the card **Web research** and offer an expandable source panel
with the question, check date and cited/retrieved links. Provenance refers to
revision 1 and survives later edits. Existing documents have `research: null`;
older APIs can omit it, which both clients accept. Refresh never starts a search.
Deletion removes provenance and prevents the research receipt recreating a report.

This is a first implementation. Model writing quality, concurrent editing by several
contacts, and device/browser presentation have not been verified yet.

## Using it

- **Ask in the chat**: "Write up the trip plan as a document", "Ana and Leo, draft the
  report together". The contact calls `create_document`; a card appears inside its
  reply bubble, as part of that contact's message (private chats and groups; on iOS a
  photo reply keeps it just below the photo, where the photo bubble has no room), and opens the document.
- **Chat details → Shared in this chat → Docs** lists the chat's documents first,
  then shared files, with **New document**.
- The viewer renders the Markdown (headings, lists, quotes, code, tables, links) with
  the same safe renderer as messages: no raw HTML and no remote images. It shows the
  revision, who updated it last, and recent revisions with their summaries. It
  refreshes every five seconds while open, because contacts may be editing.
- **Edit** (web pencil, iOS ⋯ menu) opens a title field and a Markdown editor with a
  **Write/Preview** switch and an optional change summary. **Delete** removes the
  document and its revisions for everyone in the chat.

## Collaboration and conflicts

Every save is a compare-and-swap on `revision` and stores an attributed revision
(the last 50 are kept). People save against the revision they started editing; if
someone else saved first, the editor shows who did and offers **Use their version**
(discard my draft) or **Keep mine** (save over it). Nothing is merged silently.

Contacts are told to `read_document` first and prefer `edit_document` with small
`find`/`replace` edits. Those apply to the latest text, so two contacts editing
different parts both keep their work; an edit whose `find` text is missing or
ambiguous is rejected with a message to reload. A full rewrite (`markdown` plus
`baseRevision`) fails if the document changed.

## Proactive work

Documents have no loop of their own. Ongoing writing goes through
[task lists](tasks.md): tasks link the document with `documentID` (migration 0058;
earlier tasks may still carry it in notes), so whoever is assigned edits that document
in its task work turns, again when its blockers finish, and in periodic reviews.
Reviewers can send a task back with `request_changes`, at most twice per task; see
[collaboration](tasks.md#collaboration-deliverables-and-bounded-reviews-0058). For example, "Leo: outline" blocks
"Ana: write the draft", which blocks "Leo: review".

## Model tools

Offered with the task tools: every private human or task turn, and the evidence phase
of every initial group draft.

| Tool | Effect |
| --- | --- |
| `list_documents` | IDs, titles, revision, size and last editor |
| `read_document` | Up to 12,000 characters from `offset`, plus recent revision summaries |
| `create_document` | Title and Markdown; the card shows inside this reply |
| `edit_document` | `edits: [{find, replace}]` (up to 20) or `markdown` with `baseRevision`; optional `title`; `summary` required |

Mutations store receipts in `document_mutation`, keyed by the turn (or group reply)
and the call, so replayed Workflow steps never apply twice. The chat's document index
is part of the system context. Document text is treated as untrusted data.

Limits: 30 documents per chat, titles up to 200 characters, bodies up to 100,000
characters. A single contact tool call carries at most 30 KB of arguments, and group
research rounds generate at most 4,096 tokens, so contacts write long documents in
several edits.

## API

Bearer-authenticated, `no-store`. Private: `/api/v1/contacts/:id/documents` (your own
chat with that contact). Group: `/api/v1/groups/:id/documents` (members; 256 KB
request bodies). Writes are limited to 60 per account per minute.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Up to 30 summaries: title, revision, preview, `sourceID`, last editor |
| GET | `/:documentID` | Full Markdown and the last 20 revisions |
| POST | `/` | `{ id (UUID), title, body? }` → `{ document }` (201) |
| PUT | `/:documentID` | `{ baseRevision, title?, body?, summary? }`; 409 with the current `document` when stale |
| DELETE | `/:documentID` | Deletes the document and its revisions (204) |

## Storage and cache

Migration `0047_documents.sql` adds `chat_document`, `chat_document_revision` and
`document_mutation`. See [infrastructure](infrastructure.md#chat-documents-migration-0047)
and [caching](caching.md#chat-documents).

## Verification

Static only: API/web TypeScript, full iOS Simulator Swift typecheck, and SQL
preparation of 38 captured document statements against all migrations with D1's
expression-depth limit. Not verified: model behavior, concurrent contact edits,
conflict handling in both editors, cards inside group replies, and rendering on a
device or browser.

## Clearing the containing chat

[Chat lifecycle](chat-lifecycle.md) removes chat documents and every revision together with their mutation receipts and source cards. Both clients invalidate document caches. Archive preserves documents and collaborative editing.
