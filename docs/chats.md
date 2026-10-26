# Private conversations

Each contact has one private conversation owned by its creator. The Hono API
uses the bearer session's user ID, never a client-supplied owner. Contact lookup,
history, sends, retries, model context, and deletion all enforce ownership.
Another user's contact or message returns 404. Sharing and shared memory are not
implemented.

## API contract

All routes require `Authorization: Bearer <session>` and return `Cache-Control:
no-store`. Prefix: `/api/v1/contacts/:contactID/chat`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/turns?before=<sequence>` | Latest 50 turns, ascending, with `nextBefore` for older pages |
| POST | `/turns` | JSON `{ "id": "<client UUID>", "text": "Hello" }`; persist and return `{ turn }` with 202 |
| POST | `/turns/:turnID/retry` | Retry the latest failed turn; return `{ turn }` with 202 |

A turn includes `id`, global monotonic `sequence`, `userText`, nullable
`assistantText`, `status` (`queued`, `running`, `complete`, `failed`), `attempt`,
and millisecond `createdAt`/`updatedAt`. Sequence gaps are normal and disclose no
message content. Internal workflow IDs, owners, and provider errors are omitted.
Repeated sends with the same UUID and trimmed text return the existing turn.
A reused UUID with different text returns 409. Only one active turn per contact
is allowed, enforced atomically in D1. Each user has at most ten active turns and
20 new send/retry admission attempts per minute. Messages allow 1–4,000 Unicode
code points after trimming, exclude NUL, and use a 32 KiB body limit. Missing
model configuration returns 503 before persisting a new send. Replies are capped
at 4,096 completion tokens, 256 KiB of provider JSON, and 20,000 code points.

## Durable execution

1. The HTTP handler commits a queued turn to D1 before acknowledging acceptance.
2. A short background dispatch creates `wildcard-chat` with a deterministic ID
   for this turn/attempt. It performs no inference in the HTTP request lifetime.
3. `ChatWorkflow` marks the turn running, calls Meta's Chat Completions endpoint
   with the configured Muse Spark variant (`META_CHAT_MODEL`), and saves the reply to D1 before completing the step.
4. A Cron Trigger runs every minute, checks up to 50 pending turns, and recovers
   queued dispatch gaps. It checks five instances concurrently, rotating by last
   check time. Terminal instances with an unfinished row become failed and can
   be retried from the app. Temporary status-query failures are deferred.

Provider requests use manual redirect handling, as required by the Workers
runtime. Non-success responses, including redirects, are rejected without
forwarding the credential to another URL.

Generation has a 45-second timeout per model request and a three-minute step
timeout. It retries transient generation failures twice with exponential delay,
then persists failure. An attempt includes up to eight completed prior turns
within a 12,000-byte UTF-8 history budget, plus selected D1 memories. Long latest
turns are explicitly clipped. Older completed messages remain searchable through
bounded, private read tools; failed turns are excluded. See [contact memory](memory.md)
for extraction, retrieval limits, provenance, and rollout.

Accepted work continues independently of iOS. Closing the app before a send is
accepted cannot guarantee delivery; unsent drafts are not persisted. The client
retains the send UUID through uncertain network outcomes while the conversation
is cached. It polls every three seconds while active with a pending reply and
revalidates idle conversations after 30 seconds. Returning to a cached conversation
displays its loaded history immediately. See [client caching](caching.md) for
lifetime, limits, invalidation, and manual refresh behavior. It offers earlier history, a multiline composer, pending status, and a
retry action for the latest failed reply. The Chats list shows the last reply or
user message, with a 500-code-point preview.

Each message bubble shows its send time with hours and minutes in the device's
local time zone and preferred time format. User messages use the turn's
`createdAt`; completed replies use `updatedAt`, recorded when the reply is saved.
Pending and failed reply indicators do not show a send time.

D1 state updates are conditional on attempt and status. A replay after a saved
reply skips inference. There is no exactly-once guarantee for the external Meta
request: a crash after provider acceptance but before saving can incur another
call on retry. Quota exhaustion, paused instances, or a persistently unavailable
Workflows control plane can delay work and require operator intervention. The
recovery job does not force a new inference attempt for an unqueryable running
instance. Inspect instance state and generic `chat_*_deferred` events; avoid
logging prompts, responses, tokens, or provider error bodies.

Deleting a contact cascades all its turns and requests termination of its active
workflow. Termination is best effort. An already accepted provider call may still
consume credits; conditional writes cannot recreate a deleted conversation.
Cloudflare workflow metadata/checkpoints have separate platform retention; only
turn IDs and attempt numbers are passed as workflow parameters, and step return
values contain no conversation text. Messages and selected memories are sent to Meta for replies and memory extraction;
this implementation does not establish a new consent or training-data policy.

## Voice input

When the draft is empty, the composer offers a microphone. Record, stop, and
review the Muse Voice Transcribe result as an editable draft before sending it.
See [voice dictation](voice.md) for permissions, formats, endpoint limits, privacy,
foreground lifecycle, and verification status. Durable generation begins after
sending the reviewed text; recording/transcription is not a Workflow job.

## Setup and release

See [infrastructure](infrastructure.md) for configuration, permissions, secret
handling, local setup, automatic releases, and rollback. Meta credentials require
access to Muse Spark 1.3. Configure `META_API_KEY` as an encrypted Workers Builds
secret; the guarded release script transfers it to the Worker's runtime secrets
without placing the value in Git, arguments, or logs. For local inference only,
add it to ignored `apps/api/.dev.vars`; leave it absent to work on auth/contacts
without making model calls. Restart Wrangler after changing local bindings or
secrets. Local Workflows/Cron emulation follows the versioned Wrangler config;
Cron recovery is not evidence of a production deployment.

Migration `0003_chat_turns.sql` adds the conversation table, composite contact-owner
foreign key, cascading deletion, and the partial unique active-turn index. It is
additive and compatible with the previous contact-only API. Code rollback does
not remove messages or stop existing workflow instances. Preserve the
`ChatWorkflow` export/binding while instances exist; pause new sends and drain or
explicitly terminate active work before a rollback to code without that class.
Do not delete the database or rewrite the migration to roll back.

## Verification status

Static TypeScript and Swift checking, release-script syntax, local migration
application, and whitespace validation were performed during implementation.
No application builds, automated tests, simulator runs, remote migrations,
production workflow creation, or paid inference were run. Installed-app behavior,
independent-account provisioning, token permissions, real model access, and
background completion still require verification after an authorized automatic
release. With fictional data, verify separate-user 404s, idempotent resend,
concurrent-send rejection, reload after app closure, retry after provider failure,
history paging, deletion during generation, and dispatch-gap recovery when runtime
checks are authorized.

## References

- [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions)
- [Meta model availability](https://dev.meta.ai/docs/models)
- [Cloudflare Workflows API](https://developers.cloudflare.com/workflows/build/workers-api/)
- [Workflows execution rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Reply notifications

Completed replies enqueue [APNs push notifications](notifications.md) atomically
with the saved response. Delivery and retries run independently of generation;
a provider failure never turns a saved reply into a failed chat. Apple setup and
an updated iOS installation are required. Foreground polling remains in use.

## Simulated outgoing message checks

User message bubbles display checks beside their send time: one muted check for
**Sent**, two muted checks after one second for **Received**, and two light blue
checks after three seconds for **Read**. These are deliberately simulated UI
states with fixed delays in `MessageReceiptView`, not server delivery or contact
read acknowledgements. The clock starts at the persisted user message's
`createdAt`; existing messages older than three seconds immediately show Read.
Navigation, reloading, and reply retries do not restart the simulation. These
states are independent of assistant generation status, including failed replies,
and of the owner's actual unread-reply watermark and push badges.

Checks appear only for persisted user messages, after API acceptance. A send that
fails before persistence has no outgoing bubble/check. Recent visible receipts
schedule only their remaining transitions; leaving/backgrounding cancels their
task and returning recomputes the state from time. Finished receipts do not keep
polling. Accessibility exposes Sent/Received/Read, and check sizes follow Dynamic
Type. No API, schema, service, or persistence changes are required. Static Swift
and whitespace validation cover the implementation; device appearance remains
unverified. No builds or tests were run for this change.

## Immediate composer clearing and delayed typing

Tapping Send clears the composer immediately, before waiting for API acceptance.
If persistence fails, the submitted text is restored only if the user has made
no subsequent draft edits or dictation insertions. New draft text is never
cleared by a previous request's successful completion. A failed request still
uses ChatStore's existing idempotent submission/recovery behavior.

Pending replies show **Typing…** only after the user's message reaches its
simulated Read state, three seconds after its persisted createdAt. Checks and
typing share the same receipt timeline and fixed thresholds. Before then, no
pending-reply indicator appears. Completed replies and failure/retry controls
remain governed by the actual turn status; already available replies are not
artificially delayed. The indicator cancels on navigation/backgrounding and
recomputes on return, without restarting the elapsed time. This is presentation
only and does not delay model inference or change unread watermarks.

## Conversational presentation and reply length

The delayed Typing indicator uses three softly animated dots with no spinner.
The dots pause while inactive; Reduce Motion keeps them still. New outgoing
messages and incoming replies use a 0.22-second fade with an eight-point
horizontal/four-point vertical offset. Reduce Motion uses a short fade only and
no animated scroll. The initial history load and earlier-history pagination do
not deliberately animate every existing message.

Bubbles measure their content with ViewThatFits. If the complete text and metadata
fit on one line, the time and outgoing checks sit beside the message. Longer or
explicitly multiline text uses the trailing metadata row underneath. This uses
actual layout measurements rather than a character-count cutoff and adapts to
Dynamic Type and the available width. Checks are 20 percent smaller, with the
same Sent/Received/Read meanings and timing.

The model's system instruction now asks for natural, direct one-to-one replies,
usually one to three sentences, matching the user's language and tone. It avoids
unnecessary introductions, recaps, lists, repeated explanations, and automatic
follow-up questions. Longer answers remain appropriate when requested or required
by the topic/context; correctness and useful information take priority. The model
and token safety limit remain unchanged. This prompt applies to future generation
after the API's automatic commit/push release, without rewriting existing replies.
Static Swift/TypeScript and whitespace checks cover the source; no builds, tests,
visual device verification, or paid inference were performed for this change.

## Outgoing bubble colors

User bubbles use the adaptive OutgoingMessageBackground color asset: a pastel
blue (#D9E7FB, approximately 85 percent white mixed with the current #045DE3
primary color) in light mode and a deeper blue (#02255B, approximately 60 percent
black mixed with primary) in dark mode. Message text uses the system primary
foreground, and timestamps and Sent/Received checks use the secondary foreground.
Read checks use primary blue in light mode and pale cyan in dark mode. Keep this
asset aligned with AccentColor if the app's brand color changes. Contact bubbles
retain the system secondary background. Swift and whitespace checks passed;
visual device verification remains pending, with no builds or tests run.
