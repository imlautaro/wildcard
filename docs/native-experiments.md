# Native iOS experiments

The [remote timer/alarm prototype](native-remote.md) additionally supports iOS/web requests
to an explicitly linked iPhone through its notification extension. It requires
migration 0034 and App Groups signing for that extension. Locked-device execution
is experimental and not yet verified on our signed device. Autonomous initiative
is unchanged.

Native experiments let an individual contact propose actions for one person's iPhone.
They are optional experiments, disabled until enabled per contact on that device.
The same agent may be shared, but enabling its tools grants no access to another
participant's phone, Calendar, Reminders, files, location or private requests.

## Deprecated experiments (2026-10-30)

NFC, Focus sessions, Guided recipes and Spoken responses are retired from the app.
Their source is retained with deprecation comments or excluded compilation blocks;
focus/recipe widget registration is disabled. Ordinary chat voice messages remain
available through the separate [voice feature](voice.md).

The active allowlist contains timers, alarms, Calendar, Reminders and location
reminders. iOS filters and persists saved tool settings and automatic preferences
on activation, so legacy settings cannot restore retired tools. Existing focus/recipe
Live Activities are ended on activation; old activity intents can only finish them.
NFC UI and implementation are excluded, and its entitlement/privacy key are commented
out. Ordinary authorized contact links, Siri, Shortcuts, widgets and shared drafts stay.

The API accepts legacy capability lists and filters retired kinds without blocking
ordinary chat messages. It advertises only active kinds, rejects retired proposals,
and prevents claiming old pending actions of retired kinds. Historical rows/receipts
remain readable and already running claims can still report an outcome; the updated
iOS app cannot execute retired actions. Existing Calendar/Reminders items and system
alarms are unaffected. No migration or new service is required. Older installed apps
need an update for their UI to match; publishing the API alone cannot remove their UI.
Rolling back to older source can re-enable retired experiments and is not a supported
way to preserve this deprecation policy.

Static checks do not verify upgrade cleanup on a device. Verify saved settings,
legacy pending requests, active-session cleanup, remaining tools and voice messages
on a signed installation. The archived behavior below describes retained source
where explicitly marked, rather than currently available capabilities.

## Start here

Open a private chat, tap the contact name/avatar, then choose **Native experiments**
in the contact details, or use
**Account → Native experiments**. Enable the contact and choose allowed tools.
This explicitly exposes its name to Siri/Shortcuts queries, the contact widget,
and the Share extension on this device. Alarm activities may expose titles
on the Lock Screen; system privacy/display settings apply.
No system permission is requested merely by enabling the experiment.

The iOS Account entry, native contact directory and contact tools all use the
root `HomeDestination` navigation path. The directory is a value-based destination,
so tapping a contact pushes its tools above the visible directory; Back returns
to the directory, then Account. Contact details use the same tools destination;
the chat toolbar has no separate native-experiments button. The details entry is
available for existing owned and shared contacts, including view-only profiles.
This navigation change reuses existing stores and does not alter cache freshness
or device permissions. Verify both entry points and repeated forward/back navigation
on a device after installing the updated app.

Ask in the private chat: new timers and alarms execute without another app
confirmation while Wildcard is in the foreground, including after leaving the chat.
The session-owned runner checks enabled contacts every five seconds and uses the
existing shared request cache. The initial AlarmKit permission prompt still applies.
Once scheduled, system alarms/timers continue independently of the app. Requests
on the original local foreground path while the app is closed wait until it returns
to the foreground. The separately enabled [remote path](native-remote.md) uses the
notification extension. Neither transport promises exact delivery timing.

**Run without confirmation** controls each supported kind per contact, account and
installation. Timers and alarms default on; reminders are optional. Calendar and location reminders keep manual review. Automatic settings
store a per-kind activation timestamp: older proposals stay manual, including on
upgrade, re-enabling a kind, or re-enabling automatic execution. Changing settings
does not undo already executed system actions. Automatic attempts are serialized,
recheck live access and current local settings, and use the same atomic claim and
receipt flow as manual execution. An uncertain automatic attempt is not retried in
the session; running claims are never replayed after restart. Failures appear in the
app banner and the requests list. The app must be open to start an action.

For manual requests, open **Native experiments → Requests on this iPhone**
to review the full proposal and tap **Review and run**. Calendar presents the system
editor; an unspecified reminder location presents a map for explicit selection.
A pending request has not been executed. **Completed** means the phone reported
finishing the operation (for example, scheduling an alarm), not that an alarm
fired or the person completed a task.

### In-app status and agent awareness

A pinned strip of compact glass cards in the private chat shows this account/contact's
active system alarms/timers; a single card spans the
width and several scroll horizontally. Other screens show the same account's cards;
tapping a card's title opens the relevant chat. Timers expose round Pause/Resume and
Cancel/Stop controls.
Each message also shows its native operation receipts as centered chips, including
pending, running, completed, failed, cancelled and uncertain outcomes, with a status
icon colored by outcome. Manual requests can be run from their chat chip. A receipt is historical: a timer can have been successfully
scheduled and subsequently cancelled without changing that operation receipt.

AlarmKit `alarmUpdates` refreshes account-filtered system snapshots while the app
is active; the foreground runner also refreshes them, including on return. The
one-second UI timeline reads local system/ActivityKit snapshots only. Exact timer
countdowns use `AlarmPresentationState.Mode.Countdown.fireDate`, including system
pause/resume changes; when that presentation is unavailable, show Timer running
rather than inventing a deadline. Alarm states distinguish scheduled, countdown,
paused and alerting. Calendar/Reminders cards confirm saving, not ongoing task
completion. The app does not read their contents. Existing alarm ID retention is
unchanged and no extra private data is written to disk.

For automatic kinds, `request_native_action` awaits up to ten one-second receipt
checks inside the existing reply Workflow step before returning its result to the
model. The awaited read loop never executes or replays a system action. Each read
rechecks source turn/attempt/account/contact access. A completed receipt tells the
model to confirm the operation without asking for activation. Pending after this
bounded wait is described as sent to the iPhone, with status visible in the app;
failed/cancelled/unknown outcomes never become success claims. Up to six automatic
tool calls can add at most 60 seconds of waiting within the existing three-minute
reply step; actual latency and model quality remain unverified. Current native-
enabled turns also receive the ten most recent terminal operation receipts for
this participant, contact and requesting device. These receipts carry no current
alarm countdown or Calendar/Reminders contents and do not authorize new actions.

The API/prompt changes require automatic publication from an authorized commit/push.
Installing only the iOS change shows cards and preserves the old-API fallback, but
cannot change the old server model's manual-review instructions. Existing bot
messages are preserved. Verify new replies after updating both backend and app.

| Capability | Example | Implementation |
| --- | --- | --- |
| Timer | “Set a timer for 12 minutes” | AlarmKit countdown, pause/resume/cancel |
| Alarm | “Set an alarm tomorrow at 7 AM” | AlarmKit fixed future date |
| Calendar | “Add a meeting tomorrow, 3–4 PM” | EventKitUI editor; user chooses calendar and saves |
| Reminder | “Remind me tomorrow at 9 AM to water the plant” | EventKit, default Reminders list, optional due date/alarm |
| Location reminder | “Remind me to buy milk when I arrive” | Reminders structured-location alarm; choose map location if omitted |

AlarmKit has its own authorization and alarms may sound through Silent/Focus.
It is distinct from existing cloud schedules, which generate chat messages.
Reminders requires full Reminders authorization even though Wildcard only creates
requested items and finds the default destination list; reminder contents are not
queried or sent to the model. Calendar uses the out-of-process event editor without
requesting broad calendar access. Location reminders are evaluated by iOS Reminders;
Wildcard does not register background location tracking or upload the chosen map
location. Map search sends the entered search to Apple's MapKit service.

### Archived focus/recipe implementation (deprecated)

The retained focus and recipe activities ran locally and do not receive ActivityKit pushes.
A focus countdown is visual: it does not itself sound an alarm, change the system
Focus mode, or automatically message the bot. Request a separate timer if desired.
ActivityKit imposes an eight-hour activity lifetime. Pausing does not extend that
lifetime. The client rejects activity payloads above a conservative 3,800-byte
combined encoded attributes/state limit. The widget supplies Lock Screen and
Dynamic Island presentations, with accessible system controls. Session and alarm
activities share the app's kind glyphs and show a large countdown or step counter,
recipe step progress, timer countdown progress and capsule controls. A paused focus
session or timer shows its remaining time; focus sessions show no progress bar because
pausing does not record the original duration. Session controls
require authentication and the currently exposed contact/account. Ending a session
ends its presentation, not a cloud chat turn. No continuous bot-research progress
or remote activity updates are implemented; ordinary reply push still applies.

## Siri, Shortcuts, Action button, and widget

**Open Wildcard contact** and **Draft a message to Wildcard** appear as App Shortcuts.
Their contact entity queries use only explicitly enabled contact identities from
the shared App Group. Configure either shortcut on supported Action buttons or
compose it with user-selected Shortcuts actions. Drafting never sends a message;
review it in Wildcard's shared-draft inbox. Intents require device authentication.
These actions open the app; they are not an unrestricted Siri conversation proxy.
The model remains the configured Meta model, not Apple's language model.

Add the **Wildcard contacts** Home Screen widget to open up to three (small) or four
(medium) enabled contacts, shown with initials because photos are not shared with the
extension. It shows identities only, no message previews or conversation history.
Widget timelines use a 15-minute refresh request, subject to system scheduling;
explicit identity changes request a reload. No real-time widget refresh guarantee.

## Share extension and private drafts

From Safari, Photos, or Files, choose **Share → Wildcard**, select an enabled contact,
and save a draft. Only the first shared item is imported. Supports plain text,
HTTP(S) links, images, PDF and UTF-8 Markdown files up to 5 MB; generic images are converted to JPEG.
The extension reads a size-checked temporary file before importing file bytes.
At most ten drafts are kept. Each draft expires after 24 hours, has a random ID,
and is bound to the current account and selected contact. Files are atomically
written with complete file protection in the App Group. It contains no auth token.
Open Wildcard, tap **Review shared drafts**, and review in chat; a nonempty composer
is never overwritten. The file is removed after successful sending or explicit
Discard. Leaving a chat preserves the original shared file for another review.
Expired drafts are hidden; writing another draft prunes expired files. Sign-out or
account replacement clears the inbox. Cold launches into the same account preserve
it. Ordinary typed composer drafts retain their existing behavior.

## Contact links

NFC reading/writing is deprecated and excluded from the app. The NFC description
below records the retained implementation only. **Share contact link** remains active.

**Share contact link** creates an HTTPS Universal Link using the agent ID.
**Write contact link to NFC tag** explicitly confirms replacing the tag's NDEF
content and requires a writable tag with enough capacity. **Read NFC tag** accepts
only the configured HTTPS host and `/native/contact` path. The URL carries routing
information, never instructions, credentials, message text or execution authority.
The receiver resolves the agent ID against their own accepted contacts. Possessing
a link neither joins a contact nor grants access. Someone without access needs an
ordinary invitation first. In-app NFC reads/writes require an NFC-capable iPhone;
background NFC opening additionally requires working Universal Links. iOS shows a
notification to tap rather than silently running arbitrary actions.

The web fallback resolves an existing authorized conversation using the session
contact directory cache. Signed-out web visitors see sign-in; reopen the link after
sign-in. The browser can now request timers/alarms on a linked iPhone; it never executes Apple frameworks locally. See [web](web.md).

## Cloud action contract and failure handling

Migration `0031_native_actions.sql` adds nullable `chat_turn.native_context_json`
and the `native_action` ledger. An iOS submission may include `nativeContext` with
an installation UUID, an allowlist of supported kinds, and optional `automaticKinds`
(a unique subset of allowed timer/alarm/focus/recipe/reminder/speech kinds). Older
clients omit the optional field and retain manual review. If an older API explicitly
rejects capabilities, the new iOS client retries once with only `automaticKinds`
omitted, preserving device ID, allowed kinds, submission ID, text, time zone,
attachment and quoted reply. Other errors do not trigger this fallback. Local
automatic execution remains enabled; until the API is updated, the model may still
describe manual review. This compatibility retry does not execute a device action. The model receives guidance
for automatic requests without treating a pending proposal as execution success. It is snapshotted with
the pending message ID across uncertain submissions. Other clients omit local native context; the server adds the phones the participant may use (see [choosing the phone](native-remote.md#choosing-the-phone)).
The UUID lives in a When-Unlocked, This-Device-Only Keychain item, separate from
the session credential. Device affinity is a routing constraint, not hardware
attestation; authorization always requires the signed-in account and its contact.

Only direct private human turns with native context receive `request_native_action`
and `list_native_actions`. Groups, scheduled jobs and private group-result deliveries
do not. Server validation enforces allowed fields per kind, lengths, finite numeric
ranges, future explicit-offset dates, and bounded duration. Coordinates must come
from an explicit user input; omitting both defers selection to the device map.
Reminders are system items, not new shared agent memory. No native calendar,
reminder, microphone, or location readings are returned by these tools.

Creation conditionally checks the current running turn/attempt and live contact.
A unique `(turn_id, kind)` returns the original proposal on retries, including
original arguments. A new human message is required to change a proposal. Up to
one proposal per kind per human message, within the existing six-tool-call budget.
Requests expire for execution after 24 hours; dates are checked again on device.

Authenticated endpoints under `/api/v1/contacts/:id/native-actions` require a
`deviceID` query parameter and current contact/model consent:

- `GET /`: last 50 proposals for that person, chat and device, newest first.
- `POST /:actionID`: `{executionID,status}`; claim pending → running atomically;
  finish running → completed/failed/cancelled/unknown with the same execution ID.
  Pending proposals may also be dismissed. Claims cannot be replayed.

Only one operation runs at a time in the app. A claim must succeed before invoking
any system action; concurrent claims receive 409. A network-uncertain claim is not
replayed, and failed acknowledgements never re-execute the action. An interrupted
running request remains explicitly unconfirmed and offers **Mark outcome unknown**.
Inspect the system app before issuing a new request. Native outcomes are reported
by the device, not independently verified by the server. An app crash or a lost
acknowledgement can leave a successful system action unconfirmed.

Account changes reject late responses and dismiss active native editors/speech.
Saved Calendar/Reminders items and scheduled AlarmKit alarms remain in their system
apps after sign-out, contact deletion or experiment disabling; those actions do not
silently undo user-saved system data. Manage Calendar/Reminders in their apps. AlarmKit does not insert alarms into
Apple's Clock app: use **Scheduled system alarms** for the contact, **Account →
Native experiments → Scheduled Wildcard alarms**, or its alarm Live Activity controls.
The account list remains available after a contact is deleted or disabled.
A protected Application Support ledger retains alarm IDs, titles, account and contact
identity across sign-outs so the same account can manage its scheduled alarms after
signing back in. The main ledger is never sent to the model or stored in the App Group. The remote
prototype uses a separate bounded App Group handoff for extension-created alarm
IDs/titles until the main app imports them; see [remote retention](native-remote.md#local-storage-and-cache). Up to 200
currently tracked alarms across local accounts are retained; system-removed alarms
are pruned on authorized refresh. Account lists never expose another account's alarms.
An alarm ID is saved before scheduling, so an uncertain scheduling result can still
be inspected/cancelled on the next authorized refresh.
Live Activities and exposed identities are removed on sign-out/contact removal;
allowed-tool settings remain scoped by local account. Deprecated focus/recipe activities are ended on activation. Permissions remain controlled by iOS.

## Cache and retention

Native action lists are session-owned, reused on return including empty results,
and revalidated after five seconds while the request screen or foreground automatic
runner is active. Both share in-flight requests and the same freshness window. Explicit
pull-to-refresh bypasses freshness; in-flight requests are deduplicated. Chat reply
updates also revalidate so newly created proposals are available on navigation.
Transient errors retain usable content without an error banner when requests are
already loaded or the foreground automatic runner polls; see
[caching](caching.md#transient-failures-during-background-revalidation). Confirmed
access loss clears the relevant contact state. Lists are bounded to 20 contacts × 50 actions with oldest-load eviction.
There is no native-action disk cache, no draft cloud upload before Send, and no
cross-account reuse. Server proposals/receipts follow source conversation retention
and cascade on turn deletion; expiry does not delete the ledger. The last 20 device
statuses are retrievable by the model in this chat only. Shared system identities
are refreshed only when their content changes. See [caching](caching.md).

## Reproduction and device checks

See [infrastructure](infrastructure.md#native-ios-experiments) for App IDs, App Group,
Associated Domains, extensions, migration, web association metadata and rollback.
A correctly signed device installation is required. Simulator typechecking is not
a signing, metadata extraction, permission, lifecycle, Siri, NFC, or APNs check.

Device checks after an authorized release:

1. Enable one contact, inspect Siri/Shortcuts entities and widget, then disable it.
2. Request each action with fictional titles; check pending versus completed state,
   deny permissions, cancel editors, and verify the system item before marking success.
3. Upgrade from saved focus/recipe/speech settings and verify those tools disappear,
   old pending requests cannot run, and existing focus/recipe activities end.
4. Schedule/cancel a test timer, exercise silent/Focus intentionally, and inspect
   alarm countdown/paused presentations on the Lock Screen and Island.
5. Save a location reminder at a chosen fictional/test location; inspect its arrival
   or departure condition in Reminders. No actual location history is required.
6. Share text, URL, image, PDF and Markdown, including unsupported/oversized content; reopen,
   navigate away/back, preserve a nonempty draft, send once, discard, and cold launch.
7. Exercise offline refresh, duplicate taps, interrupted execution, lost acknowledgement,
   expired proposals, contact removal, sign-out and account switching. Never retry
   an uncertain system action to test idempotency against real personal data.
8. Verify NFC controls are absent. Resolve an ordinary shared contact link as an
   existing participant, an outsider, and a signed-out web visitor.

Current verification: API/web typechecks, Swift typechecks, plist/project syntax,
and SQL compilation against an empty migrated schema are static checks only.
No builds, tests, install, signing changes, live model/native actions, production
migrations or releases are performed by this implementation task.

## Apple references

- [Live Activities and constraints](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities?changes=_6)
- [AlarmKit scheduling and countdown extension requirements](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit)
- [Calendar and Reminders access levels](https://developer.apple.com/documentation/EventKit/accessing-the-event-store?language=objc)
- [Reminder geofence alarms](https://developer.apple.com/documentation/eventkit/ekalarm/structuredlocation?changes=_7_1)
- [App Intents and system entry points](https://developer.apple.com/videos/play/wwdc2025/244/)
- [NFC background reading and Universal Links](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)

The main app privacy manifest declares own-app UserDefaults preferences and local/
user-selected file metadata reasons; Share declares user-selected file metadata.
These declarations describe API usage, not a completed App Store privacy review.
[Apple required-reason API documentation](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).

### Automatic execution device verification

Verify new timers/alarms run from chat without opening Native experiments. Toggle
automatic execution off/on and confirm older requests stay manual. Leave the chat
while waiting, background/foreground the app, deny permission, switch accounts and
revoke contact access. Confirm interrupted claims/acknowledgements do not duplicate
execution. Verify optional automatic tools and Calendar/location manual review.
These checks require a signed device and remain pending.

Verify the two-minute timer case with both the new backend and app: the bot should
confirm the device receipt without manual activation instructions, and the timer
must remain visible while chatting and browsing Account/Chats. Pause/resume/cancel
from both system surfaces and the in-app card; confirm the exact countdown tracks
system presentation and falls back honestly if unavailable. Exercise expiry,
permission denial, missing acknowledgement, app restart, disabled tools, account
switch and legacy focus/recipe session cleanup. These device/model checks
remain pending; static typechecks do not establish runtime correctness.

## Layout

iOS: the contact screen keeps the main switch at the top, opens **Allowed
tools**, **Run without confirmation** and **Try it in chat** as rows with counts that
open sheets, and links to contact details → **Timers and alarms** for receiving
timers from the web and other people. Explanations for those, Contact link and Requests are behind info
buttons. Web: the informational page lists capabilities and opens Automatic execution,
Live status and receipts, Remote timers and alarms, and What stays on your iPhone in
sheets. See the settings pattern in [contacts](contacts.md#contact-details-layout).


## Shared-contact timer and alarm access

With migration 0083, a linked iPhone's account can explicitly allow a current
shared-contact participant under **Who can send to this iPhone**, and switch that
participant off again from iOS or web. Sharing a
contact or enabling local automatic execution grants no such access by itself.
The requester just asks in their own private chat and the contact picks the
permitted phone from the message, for text and voice messages alike. Both
clients show device scheduling receipts. See [delegation and cache behavior](native-remote.md#allow-a-shared-contact-participant)
for setup, limited permissions, revocation/in-flight semantics, pending-send
recovery and the two-account device checks still required. This browser-facing
control does not make Apple frameworks executable in a browser.
