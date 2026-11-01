# Remote iPhone timers and alarms

This implementation lets a direct private chat request from iOS or web target
an explicitly linked iPhone. It uses a visible APNs alert and the Notification
Service Extension to schedule AlarmKit without opening the main app. It is an
experimental device path: static validation does not establish that AlarmKit
permissions/client identity or countdown presentation work from our signed
extension on a physical iPhone. A receipt, not APNs acceptance, establishes success.

## Enable and try

1. Provision migration `0034_remote_native_actions.sql` through the existing
   automatic commit/push release. Keep the existing APNs provider configuration.
2. On Apple Developer, enable **App Groups** for the existing Notification Service
   App ID as well as the main app, Widgets and Share. Assign the same group
   (`group.com.imlautaro.Wildcard` by default). Xcode must refresh its development
   profile. The new versioned `Config/NotificationService.entitlements` and target
   settings are required; source files alone do not change the Developer Portal.
3. Install the updated app and embedded notification extension using Xcode. Open it
   once after device restart/unlock and sign in. Allow visible notifications and
   AlarmKit. In a contact's **Native experiments**, enable timers/alarms, then
   **Receive timers and alarms**. This grant belongs to this participant,
   contact and installation, including for shared contacts. At most 20 contacts per
   device can have grants. The extension checks the local per-kind allowlist too.
4. In that contact's web chat, open the **Timers & alarms** chip above the composer
   (it appears once chat polling lists the linked iPhone), choose the iPhone and
   send “Set a timer for two minutes.” Multiple iPhones show an installation suffix.
   Selection stays in the session conversation cache; a pending send snapshots the
   target, time zone and message UUID. Retries cannot silently choose another phone.
5. Lock the iPhone, leaving the app in the background, and repeat. Then repeat after
   closing it from the app switcher. Expect a visible “Preparing…” notification,
   followed by the timer/alarm and a device receipt. Do not tap the notification as
   part of verifying unattended execution. Check sound, countdown and cancellation.
   After the cancellation correction below, the user reported a new web-to-iPhone
   timer working in the guided locked-phone check on October 28, 2026. The full
   sequence, force-quit behavior and alert/control verification remain pending.

Existing grants re-register silently on launch and whenever APNs rotates the
token. Because the token arrives after Home starts, re-registration waits for it
(and for visible notifications) without showing an error, and retries transient
network failures on the next launch or token change. Only an explicit
**Receive timers and alarms** tap reports missing notifications or token.
This is iOS-only: the web client registers no APNs device.

The normal foreground native path remains available without remote grants.
Installing this binary before publishing the backend cannot enable remote control;
its settings request fails visibly. The existing local capabilities fallback is
unchanged. This prototype does not auto-publish or alter Apple account capabilities.

## Transport, timing and receipts

The web passes `remoteDeviceID` on a human message. The API resolves the target's
live grant, contact ownership, push registration and unexpired iPhone session; the
browser cannot assert a trusted remote `nativeContext`. The server snapshots a
remote context containing only the granted timer/alarm kinds. Groups, schedules,
group-result deliveries and the initiative evaluator receive no new device tools.

`request_native_action` creates the normal unique `(turn_id, kind)` ledger entry
and its remote outbox fields in one SQL statement. It records the original alarm
fire time, target, random nonce and a claim deadline no later than 60 seconds after
creation or the fire time. A timer counts down to that recorded fire time; a late
push cannot restart its full original duration. An expired request cannot claim or
schedule anything. A new human request is required to try again.

The existing API Worker sends an immediate APNs alert with `mutable-content: 1`.
Cron can retry unaccepted pushes within the deadline, with a lease and at most three
transport attempts. APNs acceptance stops transport retries and never marks an
operation completed. Device/network/notification policy can delay or prevent
execution. No exact-delivery guarantee is made, particularly for short timers.

The payload contains a domain-separated HMAC capability derived from the existing
`BETTER_AUTH_SECRET` and a random per-action nonce. No main-app session credential
is shared. The capability authorizes only that action's claim and receipt endpoint;
there is no conversation read or arbitrary-action API. The extension obtains the
canonical arguments from the server instead of trusting push arguments. It checks
local account, installation, contact/kind allowlist and expiry. The main app requires
AlarmKit authorization before enabling a grant; the extension lets `schedule()`
enforce system permission rather than treating its synchronous authorization
snapshot as a cancellation decision. It never prompts for permission while locked.

A pending→running claim is atomic and never replayed, even with the same execution
UUID. Duplicate APNs deliveries or simultaneous local/extension processing cannot
claim twice. Foreground native execution is prohibited for remote records on both
client and server. The extension saves an alarm ID before scheduling, checks local
permissions again, and posts completed only after AlarmKit reports success. Lost
acknowledgements never reschedule. Unknown/running outcomes require inspecting the
system before making a new request. Network operations use ephemeral sessions,
fixed configured HTTPS origin, no redirects/cookies and six-second timeouts. The
capability is removed from delivered notification content, including the timeout
fallback. Extension termination can still leave an operation unconfirmed.

The existing bounded model wait sees device receipts when they arrive promptly;
otherwise the bot reports pending delivery. Web chat shows the last 20 remote
operation receipts, not a fabricated live countdown. The iPhone imports known
extension alarm IDs into its protected alarm ledger on authorized foreground
refresh and reconciles them with AlarmKit. Whether extension-scheduled alarms share
client identity with the main app is a required physical-device verification.
Do not infer live state or control success from a creation receipt.

## Revocation and account isolation

Turning off the iPhone grant removes the local allowlist first, then revokes the
server grant. Disabling timer/alarm kinds also removes local permission immediately
and reconciles registration in the foreground. Offline failure leaves local
execution blocked even if the server still lists a stale grant. Web **Revoke
access** removes the server grant. Registration refresh updates existing grants;
it cannot recreate a grant revoked from web. Only explicit enabling on the iPhone
can recreate it. Revocation stops future claims and does not undo system alarms
already scheduled or a system operation already in flight.

Account switching/sign-out clears the shared execution allowlist. Server checks
also require the iPhone's current registered session, contact access, per-kind grant
and current model consent. Session/push registration removal cascades device grants;
historical native operation receipts remain with their source conversation and
retain remote provenance. Sharing a contact alone never grants another participant control
of your phone. The separate, explicit delegation below can grant timer/alarm access. Turning remote control on does not authorize autonomous bot actions.

## Local storage and cache

The App Group now contains an opt-in account/device/contact/kind allowlist and a
bounded handoff of up to 200 alarm IDs, titles, account/contact IDs and deadlines.
Both use `completeFileProtectionUntilFirstUserAuthentication` so they can be read
while locked after the first unlock following restart. Before that unlock execution
fails closed. This is a deliberate exception to the complete-protection draft
storage, required by the requested locked-device feature; drafts are unchanged.
No account credentials or reusable device bearer secrets enter shared storage.

The main app imports system-confirmed handoff records to its existing protected
alarm ledger and removes imported shared files. Non-active same-account handoff
records older than their fire time plus 24 hours are pruned on authorized refresh.
IDs of possibly successful operations survive sign-out so the same account can
inspect them later. The 200-file limit fails closed rather than dropping IDs.

Web device/receipt snapshots are session-owned, bounded to 20 contacts, reuse empty
results and deduplicate in-flight requests. The existing visible-chat polling calls
the snapshot refresh, limited to five-second freshness. Navigation reuses usable
content through failures; explicit device refresh bypasses freshness. Session reset,
contact removal and confirmed access loss clear relevant state and reject late
responses. Successful revocation updates cached devices immediately and revalidates;
existing pending submissions retain their original target and idempotency ID. These
rules complement [caching](caching.md), not a new persistent browser cache.

## Allow a shared-contact participant

Migration `0083_delegated_remote_native.sql` adds explicit participant grants. After
both accounts have accepted access to the same contact:

1. On the target iPhone, enable the contact's timer/alarm kinds and **Receive
   timers and alarms** in **Native experiments** as before.
2. Under **Who can send to this iPhone** in that same screen, turn on the intended
   participant's switch. On web, open the chat's **Timers & alarms** chip; the sheet
   lists the same switches under **Who can send to your iPhone**. Delegation is keyed to
   this installation, never to the chat's selected target. This authorizes requests
   without per-action approval. It grants only the timer/alarm kinds currently enabled.
3. That participant opens their own private chat with the same shared contact,
   picks **Your name’s iPhone** from the **Timers & alarms** chip and asks, for example, “Set a timer on my husband's
   phone for ten minutes.” Text and voice-message requests use the same selected
   target. Device selection is explicit; mentioning a phone cannot silently override
   it, and this does not add a live voice-call command interface.
4. Turn that participant's switch off on either client to remove only
   their permission. Disabling the parent remote grant removes all its delegations;
   participant/contact/account/session/device deletion also removes dependent grants.

Only the iPhone account can delegate its device. Being the shared agent's creator
does not authorize control of another participant's device. Delegates cannot grant
access onward, register someone else's phone, read their chat or access Calendar,
Reminders, live countdowns, or other system data through this permission. Available
phones identify their owner's account name; installation suffixes distinguish phones.
Existing private histories remain separate. At most ten live target phones, three
other participants and thirty outgoing delegations are returned in a snapshot.

The additive table references both the recipient's private contact and the device
owner's existing `(device_id, contact_id)` grant with cascading deletion. A live
access view checks that both contacts still belong to the same agent. Each new
delegation gets a random identity; duplicate enable requests preserve it, whereas
revoke/re-enable creates a new identity. A turn snapshots that identity and the
server-resolved target device key/name. A revoked request cannot become valid again
when permission is re-enabled. Existing own-account turns without that snapshot
remain restricted to the same account's original grant.

Action creation, push selection and atomic device claims check current access and
the granted action kind. Both requester and device-owner model consent are checked
before delivery and claim. Push and canonical command identities use the device
owner's account/contact, so the unchanged extension validates the existing local
allowlist and files alarm IDs under the correct owner. Requester identities remain
server-side; receipts stay only in the requesting private chat. Revocation blocks
future claims, including delivered but unclaimed pushes. It cannot recall an
operation already claimed or remove an existing system alarm; remove those on the
iPhone. Delivery/expiry and uncertain-result rules above still apply.

Both clients retain an unavailable selected phone until the person explicitly
changes it. Requests cannot fall back silently to their own phone after revocation.
Retries preserve the original target and message UUID; the chip's choices stay
locked during an unresolved remote submission. The iOS chip menu offers **Discard pending send**
to release that retry before selecting another phone, with a reminder to inspect
the phone when the outcome is unknown. iOS never lists the current installation as a
remote choice: requests typed on that iPhone already use the local path. Discarding a local retry cannot recall an
already accepted server request. Native iOS suppresses local
native capabilities when a remote phone is selected.

`GET /contacts/:id/native-remote` adds `owned` on devices plus `participants` and
outgoing `delegations`. Authenticated owner-only mutation routes are
`PUT` / `DELETE /contacts/:id/native-remote/:deviceID/participants/:participantID`.
The participant ID is a current participant contact ID from that snapshot, never an
email or a client-asserted owner account. Existing device registration/revocation
routes are unchanged. No new secret, binding or Apple entitlement is required.

### Delegation cache and verification

The web extends its existing twenty-contact, five-second session cache. iOS uses
`ContactsStore.remoteSnapshots` through `NavigationSnapshotCache` (eight snapshots,
with the bounded response sizes above). Empty results and loaded receipts render
synchronously on return; visible active views refresh at five-second intervals and
manual refresh bypasses freshness. Reads deduplicate and transient errors retain
usable snapshots. Successful permission changes replace the affected grant locally,
invalidate older reads and revalidate. Per-contact mutation gates prevent competing
permission writes. Contact/access loss removes snapshots and session replacement
replaces their owner; model changes invalidate them. Late reads cannot restore
removed grants. Nothing is persisted to browser storage or additional iOS files.
Selection/pending sends live in the existing conversation stores and retain their
existing eviction rules. Cached permissions never authorize an operation.

Static API/web types, Swift checks and empty-schema SQL preparation are recorded
with this change. No builds, runtime tests, pushes, real-account grants or device
alarms are exercised by static checks. Before claiming two-account operation, use
fictional accounts to verify: no grant by default; owner grant; delegate timer and
alarm from both clients, including voice messages; correct selected device with
two phones; locked/background receipt; revoke before claim; revoke/re-enable does
not revive an old turn; disable parent grant/kind; remove/rejoin participant;
failed/offline refresh; back/reopen with empty snapshots; account switch during
read/mutation; attempted self/onward/unrelated-agent grants; duplicate push and
unknown receipt behavior. Confirm actual system alarms separately from receipts.

### Settings and chat layout

The owner's **Native experiments** screen has one **From the web and other people**
section: the **Receive timers and alarms** switch with a status line (Off, Connecting
this iPhone, Paused because notifications or AlarmKit are off with an **Open Settings**
row, or On), then **Who can send to this iPhone** listing the owner and a switch per
current participant. In chat, a single-line **Timers & alarms** chip above the composer
shows the current destination (This iPhone/Off, or the selected phone, tinted) and
replaces the earlier top banner. Web opens a sheet from the chip with the destination
choices and, for an owned phone, the participant switches and **Stop receiving on your
iPhone**. Receipts name the phone (“Set on Lucía’s iPhone”); the snapshot's
`deviceName` now carries the owner's name for phones owned by someone else.

## Future autonomous initiative

The server-side outbox/claim/receipt transport is reusable for a future autonomous
planner. This implementation only exposes it to direct private human turns. The
initiative planner is unchanged and cannot create alarms/timers by itself. A future
change needs a separate per-contact/device autonomy grant, policy and source record,
limits, scheduling semantics and revocation behavior before advertising that ability.
No background permission is inferred from shared memory or ordinary initiative.

## Validation and independent installation

See [infrastructure](infrastructure.md#remote-native-device-execution) for the
reproducible setup and rollback sequence. Local static checks cover API/web types,
main app and notification-extension Swift types with application-extension API
restrictions, plist/project syntax and compilation of 22 SQL variants against all
34 migrations on empty in-memory SQLite. They do not send pushes, schedule real
alarms, test model responses, verify Apple signing, or establish App Review approval.
No tests or builds were run for this implementation.

Required device cases: background vs force-quit vs before-first-unlock, permission
denial, Focus, connectivity loss/delay, duplicate push, claim/receipt interruption,
web grant revocation followed by reopening iOS, kind disable, account switching,
contact deletion/consent loss, multiple phones, source deletion and main-app alarm
visibility/control. Check backend receipts and actual system state independently.

Sources: [Apple extension behavior](https://developer.apple.com/forums/thread/808088),
[notification extension requirements](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications),
[AlarmKit sample](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit),
and [an independently demonstrated extension scheduling prototype](https://blog.jacobstechtavern.com/p/apps-system-design).

### Cancellation diagnostics

The original prototype grouped request identity, expiry, local revocation,
notification cancellation and the extension's AlarmKit authorization snapshot into
one `cancelled` branch. A reported Cancelled receipt could not identify the failed
condition. The extension now gives a distinct visible notification reason for each
request-validation cancellation. Its authorization snapshot is diagnostic only:
main-app authorization remains required when enabling remote access, and AlarmKit
itself validates permission in `schedule()`. No permission request is made from the
extension and no system authorization is bypassed. A scheduling error stays unknown,
never completed, because an error or lost acknowledgement cannot prove absence.

Bounded OSLog entries contain only the stage, authorization enum and NSError
domain/code, never action tickets, IDs, payloads or message contents. The visible
notification distinguishes scheduling errors from request rejection. The backend
status contract, web receipt cache and foreground execution path are unchanged.
New behavior needs a new installed iOS binary and a fresh request: previously
cancelled operations are never replayed. Extension client identity/permission
behavior still requires checking on a physical device; this code change alone does
not prove AlarmKit scheduling succeeds from the extension.

On October 28, 2026, after installing this correction and asking the user to lock
the phone and request a fresh web timer, the user reported that it worked. This is
one user-reported successful case, not an independently traced confirmation of the
old cancellation cause, force-quit behavior, sound at expiry or main-app controls.
