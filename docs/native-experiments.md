# Native iOS experiments

Native experiments let an individual contact propose actions for one person's iPhone.
They are optional experiments, disabled until enabled per contact on that device.
The same agent may be shared, but enabling its tools grants no access to another
participant's phone, Calendar, Reminders, files, location or private requests.

## Start here

Open a private chat, tap the contact name/avatar, then choose **Native experiments**
in the contact details, or use
**Account → Native experiments**. Enable the contact and choose allowed tools.
This explicitly exposes its name to Siri/Shortcuts queries, the contact widget,
and the Share extension on this device. Live Activities may expose titles and
recipe instructions on the Lock Screen; system privacy/display settings apply.
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

Ask in the private chat, then open **Native experiments → Requests on this iPhone**
to review the full proposal and tap **Review and run**. Calendar presents the system
editor; an unspecified reminder location presents a map for explicit selection.
A pending request has not been executed. **Completed** means the phone reported
finishing the operation (for example, scheduling an alarm), not that an alarm
fired, a recipe was cooked, or the person completed a task.

| Capability | Example | Implementation |
| --- | --- | --- |
| Focus session | “Help me focus for 25 minutes” | ActivityKit + WidgetKit, countdown, pause/resume/finish |
| Guided recipe | “Guide me through these recipe steps” | ActivityKit, up to 12 steps, Next/Finish controls |
| Timer | “Set a timer for 12 minutes” | AlarmKit countdown, pause/resume/cancel |
| Alarm | “Set an alarm tomorrow at 7 AM” | AlarmKit fixed future date |
| Calendar | “Add a meeting tomorrow, 3–4 PM” | EventKitUI editor; user chooses calendar and saves |
| Reminder | “Remind me tomorrow at 9 AM to water the plant” | EventKit, default Reminders list, optional due date/alarm |
| Location reminder | “Remind me to buy milk when I arrive” | Reminders structured-location alarm; choose map location if omitted |
| Speech | “Read that explanation aloud” | AVSpeechSynthesizer, system-language voice, explicit Stop |

AlarmKit has its own authorization and alarms may sound through Silent/Focus.
It is distinct from existing cloud schedules, which generate chat messages.
Reminders requires full Reminders authorization even though Wildcard only creates
requested items and finds the default destination list; reminder contents are not
queried or sent to the model. Calendar uses the out-of-process event editor without
requesting broad calendar access. Location reminders are evaluated by iOS Reminders;
Wildcard does not register background location tracking or upload the chosen map
location. Map search sends the entered search to Apple's MapKit service.

Focus and recipe activities run locally and do not receive ActivityKit pushes.
A focus countdown is visual: it does not itself sound an alarm, change the system
Focus mode, or automatically message the bot. Request a separate timer if desired.
ActivityKit imposes an eight-hour activity lifetime. Pausing does not extend that
lifetime. The client rejects activity payloads above a conservative 3,800-byte
combined encoded attributes/state limit. The widget supplies Lock Screen and
Dynamic Island presentations, with accessible system controls. Session controls
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

Add the **Wildcard contacts** Home Screen widget to open up to three enabled
contacts. It shows identities only, no message previews or conversation history.
Widget timelines use a 15-minute refresh request, subject to system scheduling;
explicit identity changes request a reload. No real-time widget refresh guarantee.

## Share extension and private drafts

From Safari, Photos, or Files, choose **Share → Wildcard**, select an enabled contact,
and save a draft. Only the first shared item is imported. Supports plain text,
HTTP(S) links, images, and PDF files up to 5 MB; generic images are converted to JPEG.
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

## NFC and links

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
sign-in. No native actions are requested/executed by the browser. See [web](web.md).

## Cloud action contract and failure handling

Migration `0031_native_actions.sql` adds nullable `chat_turn.native_context_json`
and the `native_action` ledger. An iOS submission may include `nativeContext` with
an installation UUID and an allowlist of supported kinds. It is snapshotted with
the pending message ID across uncertain submissions. Other clients omit it.
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
signing back in. It is never sent to the model or stored in the App Group. Up to 200
currently tracked alarms across local accounts are retained; system-removed alarms
are pruned on authorized refresh. Account lists never expose another account's alarms.
An alarm ID is saved before scheduling, so an uncertain scheduling result can still
be inspected/cancelled on the next authorized refresh.
Live Activities and exposed identities are removed on sign-out/contact removal;
allowed-tool settings remain scoped by local account. Explicitly disabling all
contact tools ends its focus/recipe activities. Permissions remain controlled by iOS.

## Cache and retention

Native action lists are session-owned, reused on return including empty results,
and revalidated after five seconds while the request screen is active. Explicit
pull-to-refresh bypasses freshness; in-flight requests are deduplicated. Chat reply
updates also revalidate so newly created proposals are available on navigation.
Transient errors retain usable content; confirmed access loss clears the relevant
contact state. Lists are bounded to 20 contacts × 50 actions with oldest-load eviction.
There is no native-action disk cache, no draft cloud upload before Send, and no
cross-account reuse. Server proposals/receipts follow source conversation retention
and cascade on turn deletion; expiry does not delete the ledger. The last 20 device
statuses are retrievable by the model in this chat only. Shared system identities
are refreshed only when their content changes. See [caching](caching.md).

## Reproduction and device checks

See [infrastructure](infrastructure.md#native-ios-experiments) for App IDs, App Group,
Associated Domains, NFC, extensions, migration, web association metadata and rollback.
A correctly signed device installation is required. Simulator typechecking is not
a signing, metadata extraction, permission, lifecycle, Siri, NFC, or APNs check.

Device checks after an authorized release:

1. Enable one contact, inspect Siri/Shortcuts entities and widget, then disable it.
2. Request each action with fictional titles; check pending versus completed state,
   deny permissions, cancel editors, and verify the system item before marking success.
3. Start/pause/resume/end focus and recipe activities, lock the device, and use
   expanded Island controls; check elapsed sessions, stale displays and no Island models.
4. Schedule/cancel a test timer, exercise silent/Focus intentionally, and inspect
   alarm countdown/paused presentations on the Lock Screen and Island.
5. Save a location reminder at a chosen fictional/test location; inspect its arrival
   or departure condition in Reminders. No actual location history is required.
6. Share text, URL, image and PDF, including unsupported/oversized content; reopen,
   navigate away/back, preserve a nonempty draft, send once, discard, and cold launch.
7. Exercise offline refresh, duplicate taps, interrupted execution, lost acknowledgement,
   expired proposals, contact removal, sign-out and account switching. Never retry
   an uncertain system action to test idempotency against real personal data.
8. Read/write a disposable NFC tag and resolve its link as an existing participant,
   another participant in the same agent, an outsider, and a signed-out web visitor.

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
