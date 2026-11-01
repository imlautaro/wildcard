# Scheduled contact messages

Contacts can create one-time and fixed-interval messages through the existing
Muse tool loop. A message carries the device's IANA time zone; old clients may
omit it, in which case the contact must resolve the time zone before scheduling
local times. No device background execution is required.

## User behavior

Ask a contact to write at a future date/time, or every ten minutes. The contact
calls `create_schedule` and confirms only a successful stored result. An ambiguous
or already-passed local time requires clarification, rather than silently moving
the request to tomorrow. The model receives current UTC and local time. Timestamp
conversion is model-assisted; the server validates the explicit-offset ISO
format, future instant, supported time zone, and bounded interval. It does not
independently verify that the model interpreted the user's natural language
correctly. The confirmation should name the resolved date, time, zone, and repeat.

Use `list_schedules`, `update_schedule`, and `cancel_schedule` to inspect, edit,
and cancel by chat. Editing replaces an active schedule's complete specification
and requires its current revision. Cancelled/completed schedules cannot be edited;
create a new one. Cancellation is also available from **Schedules** in the chat's
three-dot menu (iOS), including while the contact is generating: each schedule is a
compact row (instruction, repetition and next time, status), and you swipe it or hold
it to cancel (VoiceOver: the Cancel schedule action). The how-it-works note is behind
the info button in the toolbar. Pull to refresh the list.
Creation and timing changes happen through chat; there is no separate form.
The list refreshes every five seconds while the screen is open and the app is
active. A one-time schedule disappears after its reply is saved successfully in
the conversation, independently of push delivery. Queued, running, and failed
one-time jobs remain visible so failures are not mistaken for successful sends.
Schedule records remain stored for history and cancellation/push checks.

Each schedule belongs to the current contact and user. Without a recipient, that user
is the only one who receives it. For [shared contacts](sharing.md), each participant has
independent schedules; a schedule can instead deliver to another participant (see
[below](#messages-for-another-participant)). Scheduled work uses the same exclusive agent queue as human messages; another participant cannot inspect or change these schedules. Deleted contacts/accounts cascade their schedules, receipts,
turns, and pending notifications. Sign-out removes device push enrollment under
the existing session rules but does not cancel stored schedules. Generation can
continue in the cloud without an active device session.

## Execution and recovery

`contact_schedule` is the source of truth. The existing `* * * * *` Cron calls
`dispatchSchedules`, selects at most 50 due schedules, and conditionally inserts
a queued `chat_turn`. The insert copies the instruction and schedule revision,
uses an empty user message, and records the scheduled occurrence. A database
trigger advances recurrence or marks a one-time schedule `completed` in that same
transaction. Here, `completed` means **dispatched**, not successfully delivered;
the conversation shows generation outcomes. iOS labels visible completed schedules
**Dispatched · pending or failed; check the conversation**.

The conditional insert checks the original cursor/revision, one active turn per
participant conversation, and at most ten active turns per user. A unique index on schedule,
revision, and occurrence additionally prevents duplicate jobs. Failed workflow
dispatch remains recoverable by the existing chat outbox/Cron. No external
control-plane scheduling call is needed to create or cancel a schedule.

Recurrence is anchored to the requested first execution. When a contact is busy
or the service recovers late, missed intervals coalesce into one latest due
occurrence. Older intervals are not emitted in a burst. One-time jobs stay due
until dispatched, cancelled, or their contact is deleted. One-time failures are
visible in chat; they do not automatically create a new scheduled occurrence.
Recurring generation failures do not stop later intervals. Existing Workflow
step retries still apply. Scheduled turns cannot be manually retried, preventing
replaying an obsolete/cancelled occurrence.

Each occurrence runs the existing `ChatWorkflow`, using current conversation and
memory, with the task instruction distinguished from a new human request. The
scheduled message is saved as an assistant message, contributes to unread counts,
and uses the existing APNs outbox. It cannot mutate schedules, and its instruction
is excluded from user-fact memory extraction. Completed scheduled replies remain
searchable as assistant history. Ordinary human turns retain existing behavior.

## Cancellation, edits, and idempotency

A schedule update or cancellation atomically invalidates pending/running turns
and deletes unsent APNs entries. Final reply writes, push enqueue, alert lookup,
and the last check before the APNs request verify the current schedule revision
and cancellation state. This discards in-flight model results after cancellation.
Already published chat messages stay in history. An APNs request already in
flight or accepted cannot be recalled, and there is an unavoidable race between
the final database check and that external request.

Schedule mutations from the model persist receipts in the same D1 batch as the
mutation. Keys are scoped to source human turn and action/target. A creation's target
is its first execution instant, interval and recipient, so one human message can
create several schedules (for example two messages at different times), while a
regenerated call for the same time and recipient replays its first result. There is
at most one edit/cancellation per schedule/action in that message. Replays return the
original result, including when regenerated arguments differ, rather than applying
another change. Before this change, a second creation in the same message was
rejected, which the contact reported as "only one schedule at a time". An updated user request
must be a new message. Only a currently running human turn can create a receipt.
The existing tool rounds (three for human turns, two for scheduled turns) and six executions bound chat-side operations.

## Messages for another participant

In a shared contact, ask: "Send Ana 'I'm leaving now' at 6 pm and 'I'm here' at 7 pm."
The contact resolves Ana with `list_message_recipients` and calls `create_schedule`
once per message with `recipientUserID`. With a recipient, `instruction` is the
exact text delivered, at most 1,000 characters (the schedule instruction limit). Before saving, the
same bounded semantic authorization as an immediate
[private message](sharing.md#private-messages-between-shared-contact-participants)
checks the current human request, recipient, text, time and repetition. Edits re-run it.

At the due time, `dispatchSchedules` delivers without inference, after waiting like
any schedule for the owner's chat to be idle (a new turn would end a reply in
progress). One D1 batch, keyed by the occurrence
(`schedule-<id>-<revision>-<due>`), inserts:

- a complete assistant-only turn in the owner's chat, which dispatches the occurrence
  through the existing trigger, saying the message was delivered to the recipient or,
  if not, that nothing was sent;
- the recipient's message, `Message from "<owner>":` plus the text, with the same
  `private_contact_message` receipt, eligibility checks (current sharing, connector
  isolation, Contributor consent) and 12-per-day limits as an immediate send;
- push outbox rows for both.

A repeated dispatch is a no-op. The owner's note is English server text. The delivered
text is never regenerated at the scheduled time, so it cannot drift from what was
authorized or end up in the owner's chat instead. Scheduled messages are text only.
Recurring intervals are allowed and count against the daily limits; an occurrence over
the limit is reported in the owner's chat. A delivered one-time schedule leaves the
API list once its receipt exists; an undelivered one stays visible as dispatched.
If the recipient leaves the shared contact or deletes their account, triggers cancel
their active schedules (migration 0089). The recipient cannot see or change the owner's
schedules.

iOS shows "To <name>" on these rows in **Schedules**. The web app has no schedules
screen yet ([web gaps](web.md)); web users create and cancel them in chat.

## Limits and timing

- Five active schedules per contact; twenty per user, enforced at insertion.
- One-time first execution must be in the future and within 366 days.
- Fixed intervals: 600–2,592,000 seconds (ten minutes to thirty days).
- Instructions: 1–1,000 characters. No external URLs/provider destinations are
  accepted as routing configuration.
- Calendar recurrences such as daily at a local clock time across DST are not
  supported. Fixed elapsed intervals do not adjust for DST or device travel.
- API lists omit successfully saved one-time jobs, then return up to 100 schedules,
  active first and then newest. Model tools retain completed history and
  return at most 20 with instructions clipped to 300 characters. The active limit
  ensures active schedules fit. There is no full historical pagination yet.
- Cancellation API: sixty requests per user per minute.
- Execution uses minute-level polling plus capacity, generation, retries, and
  APNs latency. This is approximate scheduling, not an exact alarm service.
- Recurring messages continue until explicitly cancelled or the contact/account
  is deleted. They consume model calls and existing Cloudflare resources.

## API and installation

Authenticated endpoints inherit contact ownership checks:

- `GET /api/v1/contacts/:id/schedules` returns `{ schedules: [...] }` with
  `id`, `instruction`, `timeZone`, `nextAt` (Unix milliseconds), `intervalSeconds`,
  `status`, `revision`, `createdAt`, `updatedAt`, `recipientUserID` (nullable) and
  `recipientName` (nullable).
- `DELETE /api/v1/contacts/:id/schedules/:scheduleID` cancels and returns
  `{ schedule: ... }`; repeated cancellation succeeds for an existing schedule.
  Missing or differently owned schedules return 404.
- `POST /api/v1/contacts/:id/chat/turns` now accepts optional `timeZone` alongside
  `id` and `text`. Public turns add nullable `scheduleID` and `errorCode`.

Apply migration `0011_contact_schedules.sql` through the existing local setup or
authorized automatic release. D1, `CHAT_WORKFLOW`, the minute Cron, the Meta key,
and optional APNs configuration are reused. No new service, secret, account
permission, dependency, or Wrangler binding is needed. See
[infrastructure setup](infrastructure.md#scheduled-contact-messages).
Install the updated iOS app to send the device time zone, render autonomous
messages without an empty user bubble, and manage schedules.

Static TypeScript, Swift, and SQL validation is recorded with the implementation.
Runtime tests, real model tool calls, background scheduling, and APNs delivery
have not been exercised for this change. After an authorized release, verify
using fictitious content: one-time/interval creation, timezone confirmation,
cancellation in chat/UI during generation, edits, app-closed delivery, and
ownership isolation. Do not log message text, device tokens, or secrets.


The iOS screen retains its loaded metadata in a bounded session cache, renders it
immediately on return and revalidates in the background. See
[navigation caching](caching.md#group-navigation-and-secondary-screens) for
request deduplication, mutation/access invalidation and verification.
