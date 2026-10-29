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
- **Open Tasks**: the checklist button in the chat's top bar, or **Tasks** in chat
  details (iOS and web). Create a list, add tasks, tap the circle to mark a task done,
  and tap a task to edit its title, status (To do, In progress, Done, Canceled),
  assignee, notes and what it waits for. **Cancel list** cancels the list and every
  unfinished task. On iOS, swipe a task to cancel it.
- Each task row shows the assignee, its status, what it is waiting for (a clock icon
  while blocked) and the result the contact recorded.

## Contact work turns

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
`apps/api/src/tasks/data.ts`): six turns per task until it is reassigned or reopened,
and 30 work turns per contact in a rolling 24 hours (`task_work`). A busy chat retries
the next minute without spending budget. These are implementation defaults, not
product decisions.

Work IDs are `task-<taskID>-v<version>-<n>`, so a reassigned or reopened task (which
changes its version) starts a fresh cycle without colliding with earlier turns. The
budget row and the next review are written in the same batch as the turn, and only
if the turn was created.

Known gaps:
- A failed task turn shows its failure without **Retry reply** (turns carry `taskID`);
  the next review tries again.
- The Tasks message notifies every group member and counts as unread, like other
  group messages.
- Proactive reviews do not follow the initiative's quiet hours (22:00–08:00), so a
  review can post, and push, at night.
- The Tasks message does not repeat the human-message check that every group member
  consented to the Contributor model. Under Contributor without full consent the
  reply fails, and each review leaves another Tasks message until the six-turn
  budget is spent.

- **Private chats**: a queued `chat_turn` with empty `user_text` and `task_id`,
  dispatched like a scheduled message through the same attention lock, with three
  tool rounds (schedules keep two). It is
  autonomous: no MCP, mini apps, native actions, image generation, schedule changes
  or group publication. It can use memory, history and task tools, and posts a short
  update to the person. It is never batched or manually retried, and a task that was
  finished, canceled or reassigned before the turn runs completes without a message.
  The chat list shows "Working on a task" while it is queued.
- **Groups**: a visible **Tasks** message ("Task assigned to Ana: Book the hotel")
  with no member as sender, and one reply opportunity for the assignee. It names a
  responsible human (task creator, list creator or group owner) as `requester_id`, so
  the existing membership, shared-memory and Contributor consent checks apply.
  `groupSourceAccess` admits it structurally (a task of this group's lists), so the
  contact can mark its task done and still publish or review its update. Whether
  there is work left is decided on the first draft: if the task is no longer open
  or assigned to that contact, the turn ends without a message. Group task tools
  never start turns inline; the Cron picks new assignments up within a minute, so
  the assigning contact's own draft is not forced into a review. The assignee must reply (like a human-requested opening) unless a
  later human message arrives; its message spends energy and can start the usual
  bounded bot replies.

The prompts ask the contact to work on the task with the evidence it has, record
progress with `update_task` (in progress, or done with a short result), report
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
| `update_task` | Status, assignee, result, notes, title or blockers |
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
| PATCH | `/items/:taskID` | `{ version, title?, notes?, status?, assignee?: {kind, id} \| null, result?, blockedBy? }` |

## Storage

Migration `0046_tasks.sql` adds `task_list`, `task`, `task_dependency`,
`task_mutation` and `task_work`, and nullable `task_id` columns on `chat_turn` and
`group_message`. See [infrastructure](infrastructure.md#shared-task-lists-migration-0046).

## Cache

See [caching](caching.md#task-boards). Both clients keep one board per chat and
revalidate it every five seconds while it is visible.

## Verification

Static only: API/web TypeScript, full iOS Simulator Swift typecheck, and SQL
preparation of 43 captured task statements (including the new group access
branches) against all migrations with D1's expression-depth limit. Not verified:
live model behavior (creating sensible lists, assigning, reporting without
repetition), private and group work turns end to end, blocker hand-offs between
contacts, energy interaction, the proactive review cadence, and both UIs on a device
or browser.
