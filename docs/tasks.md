# Shared task lists

Contacts and people can keep **to-do lists** in any chat to work on something
specific. In a private chat the lists belong to that participant's chat with the
contact; in a group they are shared by every member, and tasks can be assigned to
contacts or to human members. Tasks can wait for other tasks (blockers), so
independent tasks run in parallel and dependent ones run in series. Lists and tasks
can be canceled.

This is a first implementation. Model quality, live turns and device presentation
have not been verified yet.

## Using it

- **Ask in the chat**: "Split the trip planning into tasks", "Ana, take the hotel
  research and tell Leo when it's done". The contact calls `create_task_list` or
  `add_task`. In groups any contact can assign itself, another contact or a human.
- **Open Tasks**: the checklist button in the chat's top bar (web), **Tasks** in the
  chat's three-dot menu (iOS), or **Tasks** in chat details (iOS and web). Create a list, add tasks, tap the circle to mark a task done,
  and tap a task to edit its title, status (To do, In progress, Done, Canceled),
  assignee, notes, next step, evidence and what it waits for. Contact tasks also offer
  **Pause work**, **Resume work** and **Cancel task**. **Cancel list** cancels the list and every
  unfinished task. On iOS, swipe a task to cancel it.
- Each task row shows the assignee, its status, what it is waiting for (a clock icon
  while blocked) and the result the contact recorded. Contact tasks in progress show a
  **Working** chip while their work is active. Paused, blocked and exhausted tasks
  show their execution state instead, plus the number of work turns used.

## Seeing the work

Contacts announce and report tasks themselves, in their own messages. There is no
"Tasks" sender in the chat.

- While a contact's task work turn is queued or running, the chat shows a row in that
  contact's name with animated dots: "Working on “Book the hotel”" (private chats and
  groups, iOS and web). The header subtitle says the same in private chats, and
  "Ana, Leo working…" in groups (on web, a contact typing a normal reply takes
  precedence; the iOS group subtitle never showed typing).
- Private turns carry `taskTitle` in `GET /contacts/:id/chat/turns`; group snapshot
  replies carry `taskID` and `taskTitle`. Both come from the polls the clients already
  run, so there is no new cache.
- When a contact creates or assigns tasks, the prompt asks it to say so in its own reply
  (who does what); the assignee's work turn then reports back in the assignee's name.
  The group work prompt tells the assignee never to mention the internal notice or a
  "Tasks" sender. This is model guidance, not enforced.

## Contact work turns

Task turns retain their existing tools and work-turn budgets. Migration 0055 adds
one [web research](web-research.md) attempt with a human-saved exact public query;
assignment alone grants no search or MCP access. They may read/edit an already
saved research document in their own chat, whose source provenance still refers
to revision 1. Broader external-tool grants remain future work.
[Persistent work controls](persistent-work.md) now expose progress, retained work-turn
budgets and pause/resume/cancel; background turns keep the existing internal tools.

Contacts normally act only when someone writes. Tasks add a new trigger: a task
assigned to a contact gives it its own **work turn**, without a human message.

| Event | Turn |
| --- | --- |
| Assigned by someone else (person or another contact), or reopened | Now |
| Its last blocker becomes done or canceled | Now (`unblocked`) |
| Assigned by the contact to itself | Review in 30 minutes |
| Still open after a turn | Proactive review every 30 minutes |

`dispatchTasks` runs from the existing minute Cron and right after every task
change. A blocked task never starts a turn. Limits (`taskLimits` in
`apps/api/src/tasks/data.ts`): six turns over the lifetime of a task, including reassignment and reopening,
and 30 work turns per contact in a rolling 24 hours (`task_work`). A busy chat retries
the next minute without spending budget. These are implementation defaults, not
product decisions.

Work IDs are `task-<taskID>-g<generation>-<n>`. An execution generation changes
when work is paused, resumed, blocked, canceled, reassigned or reopened, and when a
person completes or edits the objective/notes/dependencies. Ordinary contact progress edits keep
that authority. Earlier generations cannot start another tool/model step or publish
a reply. The budget row and next review are written in the same batch as the turn;
current state, blockers and daily budget are checked inside that transaction.
Neither reassignment nor reopening refunds recorded work. Migration 0054 counts
earlier assignment cycles when preserving existing consumption.

Known gaps:

- A failed task turn shows its failure without **Retry reply** (turns carry `taskID`);
  the next review tries again.
- The hidden group trigger still counts as a newer message for other contacts' drafts
  in flight (the history-unchanged guard), as before.
- Proactive reviews do not follow the initiative's quiet hours (22:00–08:00), so a
  review can post, and push, at night.

Group dispatch now checks shared-memory permission and every member's Contributor
consent before adding an internal trigger, using Standard for connector-isolated
groups. Inference and publication still check current access. Provider errors
and already admitted work can still spend a reserved turn.

## Turn scope

- **Private chats**: a queued `chat_turn` with empty `user_text` and `task_id`,
  dispatched like a scheduled message through the same attention lock, with three
  tool rounds (schedules keep two). It is
  autonomous: no MCP, mini apps, native actions, image generation, schedule changes
  or group publication. It can use memory, history and task tools, and posts a short
  update to the person. It is never batched or manually retried, and a task that was
  finished, canceled or reassigned before the turn runs completes without a message.
  The chat list shows "Working on a task" while it is queued.
- **Groups**: an internal trigger message ("Task assigned to Ana: Book the hotel",
  `task_id` set, no member as sender) and one reply opportunity for the assignee. The
  trigger is hidden from people: the message list, chat-list preview, unread counts,
  badges and push all skip `group_message` rows with `task_id`, and a contact's reply
  cannot quote it. Contacts still see it in their context as the turn's trigger. It names a
  responsible human (task creator, list creator or group owner) as `requester_id`, so
  the existing membership, shared-memory and Contributor consent checks apply.
  `groupSourceAccess` admits it structurally (a task of this group's lists), so the
  contact can mark its task done and still publish or review its update within the
  same active generation. Paused, blocked, canceled or superseded work cannot
  publish. Whether there is work left is decided on the first draft: if the task is no longer open
  or assigned to that contact, the turn ends without a message. Group task tools
  never start turns inline; the Cron picks new assignments up within a minute, so
  the assigning contact's own draft is not forced into a review. The assignee must reply (like a human-requested opening) unless a
  later human message arrives; its message spends energy and can start the usual
  bounded bot replies.

The prompts ask the contact to work on the task with the evidence it has, record
progress with `update_task` (in progress with next step/evidence, done with a short
result, or blocked with a reason when human input is needed), report
briefly, and not repeat earlier updates. This is model guidance; nothing enforces
the quality of the work.

For writing work, contacts put a document's ID in the task notes, so task turns edit
that [document](documents.md).

## Model tools

Offered in every private human or task turn (not schedules or group-request results)
and in the evidence phase of every initial group draft (not reviews):

| Tool | Effect |
| --- | --- |
| `list_tasks` | Active lists with task IDs, status, assignee, blockers and results, plus assignable members |
| `create_task_list` | A list with up to 50 tasks; `blockedBy` names earlier tasks by position (`"1"`) |
| `add_task` | One task in a list; `blockedBy` lists task IDs |
| `update_task` | Status, assignee, result, notes, title, blockers, next step, evidence or a blocked reason/state |
| `cancel_task_list` | Cancels the list and its unfinished tasks |

Every mutation stores a receipt in `task_mutation`, keyed by the turn (or group
reply) and a hash of the call, so a replayed Workflow step returns the recorded
result instead of applying it again. The current board (active lists) is also part
of the system context.

## Rules

- Assignees must be current members: in a private chat the person or the contact;
  in a group a member or a group contact. Former members keep their tasks and show as
  "Former member".
- Blockers must be tasks in the same list, at most ten, without cycles.
- Limits: 20 active lists per chat, 50 tasks per list, titles up to 300 characters
  (lists 200), notes and results up to 2,000.
- People's edits carry the task `version`; a stale edit returns 409 and the clients
  reload the board. Contacts' edits apply to the current version.
- Lists are canceled, never deleted; they are removed with their contact or group.

## API

Bearer-authenticated, `no-store`. Private: `/api/v1/contacts/:id/tasks` (your own
chat with that contact). Group: `/api/v1/groups/:id/tasks` (members). Writes are
limited to 60 per account per minute. Every write returns the whole board.

| Method | Path | Body |
| --- | --- | --- |
| GET | `/` | Returns `{ lists, members }` |
| POST | `/lists` | `{ id (UUID), title, tasks?: [{ title, notes?, assignee?, blockedBy? }] }` |
| PATCH | `/lists/:listID` | `{ title? , status?: "canceled" }` |
| POST | `/lists/:listID/tasks` | `{ id (UUID), title, notes?, assignee?, blockedBy? }` |
| PATCH | `/items/:taskID` | `{ version, title?, notes?, status?, assignee?: {kind, id} \| null, result?, blockedBy?, workState?, nextStep?, evidence?, blockedReason? }` |

## Storage

Migration `0054_persistent_task_controls.sql` adds execution state/generation,
progress/evidence, guarded edit tokens and receipt generations; see
[persistent work](persistent-work.md) for compatibility and verification.

Migration `0046_tasks.sql` adds `task_list`, `task`, `task_dependency`,
`task_mutation` and `task_work`, and nullable `task_id` columns on `chat_turn` and
`group_message`. See [infrastructure](infrastructure.md#shared-task-lists-migration-0046).

## Cache

See [caching](caching.md#task-boards). Both clients keep one board per chat and
revalidate it every five seconds while it is visible.

## Verification

D1 rejects compound SELECTs with more than five terms (`too many terms in compound
SELECT`), unlike local SQLite. The first release added two `UNION ALL` branches to
`groupSourceAccess`, which made every group reply and **Retry reply** fail in
production. Task notices now share the existing human-author and human-root
branches. Every statement of a full two-contact group turn (81) and all task and
document statements (93) were then prepared on the local workerd D1 engine
(`wrangler d1 execute --local`), which enforces the production limits.

Static only: API/web TypeScript, full iOS Simulator Swift typecheck, and SQL
preparation of 43 captured task statements (including the new group access
branches) against all migrations with D1's expression-depth limit. Not verified:
live model behavior (creating sensible lists, assigning, reporting without
repetition), private and group work turns end to end, blocker hand-offs between
contacts, energy interaction, the proactive review cadence, and both UIs on a device
or browser.

Work visibility and hidden triggers (October 29, 2026): API and web TypeScript, a full
iOS Simulator Swift typecheck, and the 11 changed statements (group list, activity,
messages, unread, snapshot replies, total unread, three push queries, the reply-quote
guard and private turns), with the real receipt fragment, prepared on local workerd D1. Not verified on a device or
browser, or against live task turns.

## Exact-query web research

Migration 0055 adds a human-only `researchQuery` PATCH field after assigning a
contact. Both editors explain public transmission, one lifetime attempt, revocation
and reassignment; both boards show usage and receipt state. The task-specific
research tool receives only a title and the server sends the stored query. See
[persistent work](persistent-work.md#public-research-permission-0055) for grant
authority, daily budgets, generation guards, retention and cache verification.

## Collaboration: deliverables and bounded reviews (0058)

Several contacts can produce one attributed deliverable with existing tasks and
[documents](documents.md):

- **Deliverable link.** `create_task_list`, `add_task` and `update_task` accept
  `documentID`, which must be a document of the same private chat or group (`null`
  removes it; deleting the document clears it). Boards show **Deliverable: <title>**
  and contacts receive the link in their work context, replacing the earlier
  "document ID in notes" convention. Document revisions keep per-author attribution.
- **Review loop.** A review is a task blocked by the task it reviews. When the review
  task runs, its assignee either marks it done (approval) or calls
  `request_changes(taskID, feedback)` on the reviewed task. That reopens the reviewed
  task as In progress with `reviewFeedback`, increments `reviewRounds`, changes its
  execution generation and gives its contact owner a work turn now; the review task
  waits again and gets an `unblocked` turn when the fix is done.
- **Termination.** At most two revision rounds per task (`taskLimits.reviewRounds`);
  the third request is rejected and the reviewer is told to finish with the current
  version or block its task for a person. Reopened work still spends the owner's
  six lifetime work turns and daily budget, so no draft/review loop is unbounded.
- **Authority.** Only the assignee of an open task in the same list that waits for the
  reviewed task can request changes (contacts through the tool; people can still
  reopen tasks directly). The review must be done when requested. Contacts are told
  never to copy private chats into shared documents; group context still excludes
  other members' private conversations except the existing explicit grants.

Both boards show **Revision round n/2** and, while the task is open, the feedback.
No new client controls: people reopen, reassign or cancel with the existing editor.
`request_changes` uses the existing replay receipts (`task_mutation`). Static checks
only; multi-contact runs, model review quality and UI remain unverified.

## Page monitors

Migration 0056 lets a person attach a public URL to a contact's task. Code checks it
on a fixed interval and gives the contact a separate change turn (3 per day, 20 per
task) only when the text changes and matches optional keywords. See
[page monitors](monitors.md).

## Clearing the containing chat

[Clear chat](chat-lifecycle.md) removes its boards, tasks, dependencies, work receipts, research and monitors/checks, and deletes reply workflows. It does not pause-and-retain tasks. Group clearing is owner-only and shared by all members. Archive preserves ongoing work.
