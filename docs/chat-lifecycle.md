# Chat lifecycle and resource cleanup

Both iOS and web offer Archive/Unarchive, Clear chat, and Delete contact from the
chat list. On iOS, use a row's swipe actions or context menu; on web, use Manage.
Clear chat offers **keep memory** or **also delete memory learned here**, with an
explicit destructive confirmation. A private chat also offers Delete contact and
data. The existing contact editor's Delete action uses the same server cascade.

## Scope and permissions

| Action | Scope | Effect |
| --- | --- | --- |
| Archive / Unarchive | One participant, private or group | Moves the row between Chats and Archived. Does not mark messages read, mute notifications, or cancel work. New messages stay archived. |
| Clear private chat | The authenticated participant's contact row | Removes its history and chat-owned work/resources, keeping the contact, persona, sharing membership, photo, and conversation preferences. |
| Clear group | Group owner, for everyone | Removes shared history and chat-owned work/resources, keeping the group, photo, membership, permissions, and each member's archive preference. |
| Delete contact as creator | Entire shared agent | Removes every participant's private chat, agent memories/personality, invitations, sharing memberships, authored group messages/media, group mini apps attributed to the agent, and assigned tasks. Groups and other authors' messages remain. |
| Delete contact as member | That participant's membership | Removes access, private history, schedules, and contributed private memories. Other people's chats and the shared agent remain. |

A cleared empty private chat leaves Home once its running workflows have been
removed (including the onboarding placeholder). It remains accessible from
Contacts. An archived empty private chat stays in Archived. An empty group stays
in its current list. Archive timestamps are server-owned and survive reinstall or
another device signing in. They are not local view preferences.

## Memory choices

Keep memory retains only already extracted human facts and agent self preferences
whose sources belong to the cleared conversation. `retained_contact_memory` and
`retained_group_memory` keep the bounded key, kind, content, attribution and update
time (at most 64 kept keys per category and attributed scope). They do not retain transcript text, source quotes, attachment bytes, image
descriptions, history search entries, or embeddings. These rows are not a hidden
copy of the chat. New grounded memories supersede kept values; explicit private
memory retractions remove kept values too.

Reads recheck the current agent/membership, shared-memory setting, MCP isolation,
and Contributor permissions. Group snapshots also retain the source's Contributor
consent; a current consent grant cannot upgrade a source that lacked it. Removing
a participant or agent removes their retained group rows. Deleting the contact,
group, or account cascades retained knowledge as well.

Also delete memory removes kept snapshots and lets source cascades remove current
facts, self memories, semantic vectors, extraction events and source-backed
relationship observations from this conversation. It preserves the configured
persona and memories grounded in other people's chats or other groups. Clearing
one conversation cannot recall information someone independently repeated in
another conversation. Keeping memory does not preserve transient relationship
observations or unfinished commitments represented as task resources.

## API

| Method | Path | Body / result |
| --- | --- | --- |
| PUT | `/api/v1/contacts/:id/archive` | `{ "archived": true }`, or false; 204 |
| PUT | `/api/v1/groups/:id/archive` | Same; current group membership required |
| POST | `/api/v1/contacts/:id/clear` | `{ "clearMemory": false, "historyRevision": 0 }`; 202 |
| POST | `/api/v1/groups/:id/clear` | Same; group ownership required |
| DELETE | `/api/v1/contacts/:id` | Existing creator/member semantics; 204 |

Clear replies contain `{ cleared: true, cleanup: "pending" | "complete" }`.
Acceptance means D1 history removal is committed; external cleanup can still be
pending. The server admits at most six clear requests per account per minute.

Contact/group summaries expose `archivedAt`, `historyRevision` and `clearing`.
History pages carry `historyRevision`. Clear compares the displayed revision and
increments it atomically with removal. Replaying a request for an older revision
cannot delete new history. An incompatible future revision returns 409. Concurrent
clears cannot race different keep/delete-memory choices through the transaction.

Every human send includes the revision captured with its pending submission.
Publication rechecks it after attachment upload. A stale/offline submission is
rejected with 409 instead of recreating old messages. Older clients without this
field work at revision zero and must update before sending to a cleared chat.
History reads reject a clear racing their queries; clients reject older epochs
and mixed-epoch pagination rather than merging old messages into new history.

## Cascade and durable external cleanup

Migration `0063_chat_lifecycle.sql` adds the archive/revision state, retained-memory
snapshots, workflow registry and `resource_cleanup` outbox. D1 triggers insert
cleanup jobs in the **same transaction** that deletes source rows. Outbox rows have
no parent foreign key: a failed R2 or Workflow request cannot erase the retry plan.

Clear removes messages and source-backed reactions, quotations, read/delivery
receipts, push jobs, native proposals/execution receipts, remote native grants
(private chats), generated images, image search descriptions, research results,
task boards/dependencies/work/monitors/checks, Markdown documents/revisions, mini
apps/state/actions, schedules, conversation initiatives and visits. Tool mutation
receipts without parent foreign keys are explicitly removed by source prefix.
Group clear also removes group requests/posts and their queued private result
turns. Migration 0064 associates those result workflows/media with both the private
chat and source group through `resource_cleanup_scope`; either scope can drive the
same job and neither reports completion prematurely. Links cascade only from the
job itself, so deleting source rows cannot erase a pending dependency. Account connectors and existing integration opt-ins are not deleted just
because the conversation was cleared.

The workflow registry tracks private/group attempts and proactive initiative
instances, including terminal instances whose checkpoints may contain text.
Dispatch checks registration before and after creation. A deletion winning that
race queues the late instance again. Cleanup uses the binding's
[instance delete API](https://developers.cloudflare.com/workflows/build/workers-api/#delete)
to stop execution and remove checkpoints. It releases matching attention claims
only after deletion succeeds or the instance is confirmed missing. Migration 0064
also preserves cleanup after a lost create acknowledgement and guards backoff
updates against newer job revisions. Private/group
resource producers cannot insert into a chat while its old workflows are being
removed. `clearing` becomes zero once its workflow jobs drain, allowing new work;
R2 cleanup can continue separately.

R2 cleanup uses referenced immutable keys and scoped prefixes. Generated/private/
group audio and image uploads register their scope before writing, and recheck
their source after provider/storage awaits. Invalid late results enqueue their
key again. Object jobs recheck live message references before deletion. Prefix
sweeps start at the first surviving key, so deleting a page never skips entries.
After the immediate deletion pass, object/prefix jobs remain for a final sweep
five minutes later; this covers uploads already in flight even if their response
is lost. The registry survives until that pass. The existing 24-hour orphan
collector remains a fallback for interrupted/older unscoped uploads. Old profile
photo replacement failures also use the durable outbox.

The minute Cron and mutation `waitUntil` process at most 40 jobs per pass, four at
a time, prioritizing workflows. Failures stay queued with bounded exponential
backoff (up to one hour); they are never reported as completed or dropped after a
retry count. A job revision prevents a late writer's new cleanup request from
being acknowledged by an older cleanup pass. Normal successful jobs are removed
after their final pass. Logs contain an event and resource kind, not file contents
or provider responses.

Deleting a generated contact also removes its generation plan/Workflow. Deleting
an onboarding contact removes its identity from the saved circle plan and queues
the original onboarding Workflow's stored checkpoints for deletion. Other
onboarding contacts and the account's own saved preferences remain.

## Cache behavior and limits

Both clients keep archive state in the existing session chat lists, without a
second archive cache. Loaded/empty results render synchronously; existing list
refresh, request deduplication and pagination remain in effect. Archived contacts
use the same loaded-page boundary as regular chats; Load older chats fills further
pages. The directory still contains all contacts. Unread totals include archived
messages; archive is independent of notification/read state.

Clear/delete purges the relevant conversation, pending sends, reactions, task,
document, mini app, media and private native snapshots. It stops voice playback
and clears the existing account-owned image/audio caches, including protected iOS
disk bytes and web object URLs. Changed history revisions from another device
perform the same invalidation before old history can project into the list. Open
views rebind to fresh stores. Account changes and mutation/read generations reject
late responses. No transcript or archive-specific data is persisted locally.

Cloud cleanup is eventually consistent with external services. It cannot retract
notifications already delivered, copies/screenshots already downloaded elsewhere,
provider retention, or actions already committed in another service (for example,
a sent MCP message, Calendar event, Reminder, or system alarm on an offline phone).
Pending app-owned server work is canceled; clearing history does not undo those
completed external actions. Content-free paid-usage/rate-limit and administrator
audit records intentionally retain their existing retention rules, preventing a
clear from refunding usage. Backups and platform logs follow their existing
provider retention. This feature is not a promise of instantaneous erasure from
uncontrolled systems.

## Validation status and manual verification

The [local integration suite](chat-lifecycle-testing.md) now passes 38 regression
cases through real routes and local D1/R2/Workflow bindings, with injected failures,
retries, late uploads, lost create acknowledgements, permissions and migration
upgrades. Migration 0064 fixes the six reproduced defects documented there. No
production deletion, paid provider call, simulator/device run or browser UI check
was performed. The local runtime does not establish production behavior. Before
release acceptance, use only fictional accounts and files for the remaining
cloud/device verification:

- private/group archive, new messages staying archived, unarchive, pagination,
  empty results, reopen/back navigation, offline refresh and account switching;
- clear with/without memory; other participants retain private history; group
  non-owners get denied and all group members observe the owner's clear;
- concurrent/offline sends, a lost clear response replayed after new messages,
  retries, paused/completed workflows, initiative jobs and agent attention;
- source rows, FTS/vector/image indexes, task monitors, tool receipts, storage
  registry, private/group/generated/voice objects and obsolete avatar versions;
- injected Workflow/R2 failures, Cron retry/backoff, delayed uploads, large prefix
  pages and queue drain after the five-minute final sweep;
- iOS/web open media/audio viewers, drafts, secondary caches and permission loss,
  including a second device receiving the changed history revision.
