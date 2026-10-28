# Remote iPhone timers and alarms

This first implementation lets a direct private chat request from the web target
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
   **Allow remote timers and alarms**. This grant belongs to this participant,
   contact and installation, including for shared contacts. At most 20 contacts per
   device can have grants. The extension checks the local per-kind allowlist too.
4. In that contact's web chat, choose the iPhone under **Timers and alarms** and
   send “Set a timer for two minutes.” Multiple iPhones show an installation suffix.
   Selection stays in the session conversation cache; a pending send snapshots the
   target, time zone and message UUID. Retries cannot silently choose another phone.
5. Lock the iPhone, leaving the app in the background, and repeat. Then repeat after
   closing it from the app switcher. Expect a visible “Preparing…” notification,
   followed by the timer/alarm and a device receipt. Do not tap the notification as
   part of verifying unattended execution. Check sound, countdown and cancellation.
   This physical-device sequence has not been executed for this change.

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
local account, installation, contact/kind allowlist, expiry and preexisting AlarmKit
authorization. It never prompts for permission while locked.

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
retain remote provenance. Shared contacts never grant another participant control
of your phone. Turning remote control on does not authorize autonomous bot actions.

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
