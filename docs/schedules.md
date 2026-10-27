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
create a new one. Cancellation is also available from the **clock** button in the
chat toolbar, including while the contact is generating. Pull to refresh the list.
Creation and timing changes happen through chat; there is no separate form.
The list refreshes every five seconds while the screen is open and the app is
active. A one-time schedule disappears after its reply is saved successfully in
the conversation, independently of push delivery. Queued, running, and failed
one-time jobs remain visible so failures are not mistaken for successful sends.
Schedule records remain stored for history and cancellation/push checks.

Each schedule belongs to the current contact and user, who is the only recipient.
For [shared contacts](sharing.md), each participant has independent schedules and is the sole recipient. Scheduled work uses the same exclusive agent queue as human messages; another participant cannot inspect or change these schedules. Deleted contacts/accounts cascade their schedules, receipts,
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
mutation. Keys are scoped to source human turn and action/target, allowing one
creation per human message and at most one edit/cancellation per target/action
in that message. Replays return the original result, including when regenerated
arguments differ, rather than applying another change. An updated user request
must be a new message. Only a currently running human turn can create a receipt.
The existing two tool rounds / six executions bound chat-side operations.

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
  `status`, `revision`, `createdAt`, and `updatedAt`.
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
