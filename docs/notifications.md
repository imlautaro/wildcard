# Reply push notifications

The iOS app registers with Apple Push Notification service (APNs) after sign-in
and requests alert/sound/badge permission. Account → Notifications offers a retry
and a link to system notification settings. Returning to the foreground refreshes
registration and permission state. Private-chat foreground banners are suppressed;
group alerts show a banner when another screen is visible. Foreground sounds are
selected by the visible conversation, as described below.
Existing chat polling refreshes replies while the app is active. No background
execution mode or silent push is required for these visible alerts.

A completed reply atomically saves an outbox entry for each registered device
belonging to an unexpired owner session. The Workflow attempts immediate delivery;
the existing minute Cron retries pending entries. Generation failures do not send
an alert, and push failures never change a completed reply into a failed turn.
No historical notifications are backfilled when enrolling a new device.

The alert title is the contact's current name and its body is the assistant reply,
as explicitly requested by the owner on October 26, 2026. The payload includes
`aps.badge`, set to the combined unread private replies and group messages at send
time. Very long replies are truncated with an ellipsis to keep the complete JSON
payload within APNs' 4096-byte UTF-8 limit, including escaping and custom fields.
The full reply remains in the chat. Notifications group by contact using
`thread-id`. Opaque contact/user IDs route a notification tap
into the matching account's conversation, with a forced history refresh. A cold
launch waits for session restoration. Another account's notification is ignored;
a deleted contact uses the existing unavailable-contact view. Authorization remains
server-side on every contact/history request.

## Apple setup

1. Use a paid Apple Developer membership with permission to manage App IDs, keys,
   and provisioning profiles. Enable **Push Notifications** and
   **Communication Notifications** on the explicit App ID
   matching your bundle ID. This checkout uses `com.imlautaro.Wildcard`; an
   independent installation must use its own bundle ID and signing team.
2. Xcode's app target includes the Push Notifications capability and
   `Config/Wildcard.entitlements`. Regenerate signing profiles after enabling it.
   `APNS_ENVIRONMENT` controls both `aps-environment` and
   `WildcardPushEnvironment` in Info.plist: Debug defaults to `development`,
   Release to `production`. Use production for TestFlight/App Store; for any
   development-signed Release build, override it to `development`.
   Verify the **signed** app's entitlement matches its Info.plist value, because
   distribution signing can rewrite entitlements. Do not send sandbox tokens to
   production or vice versa. No APNs environment is inferred from the API origin.
3. Create an APNs token signing key with access to the intended app/topic and
   environments. Download the `.p8` once and store it securely outside Git. Record
   its Key ID and the Apple Team ID. Do not paste the private key into chat.
4. Add all four encrypted **Workers Builds** secrets:
   - `APNS_PRIVATE_KEY`: the complete PKCS#8 PEM `.p8` content. Actual newlines or
     literal `\n` sequences are supported.
   - `APNS_KEY_ID`: the Apple key identifier.
   - `APNS_TEAM_ID`: the Apple Developer Team ID.
   - `APNS_TOPIC`: the exact app bundle ID.
5. Commit/push an authorized release. The automatic pipeline copies all four
   values to encrypted runtime secrets in the same private temporary file used
   for other secrets. If any APNs build setting is supplied, all four must be
   nonempty. If none is supplied, existing runtime secrets are preserved. An
   installation without APNs configuration continues serving chats and auth;
   pending notifications expire after 24 hours. No separate Cloudflare service
   or Firebase account is required.
6. Install the updated, correctly signed iOS app on a physical device, sign in,
   and allow notifications. Updating the API does not update the installed app.

## API and persistence

`PUT /api/v1/push/device` and `DELETE /api/v1/push/device` require a valid bearer
session. Both accept exactly `{ "token": "<hex APNs token>", "environment":
"development" }` (or `production`) and return 204. Bodies are limited to 2 KiB,
with 30 operations/session/minute and at most ten active devices per session.
Tokens are upserted by token/environment and reassigned to the current validated
session; deletion only removes the current session's matching registration.
The client never supplies another user's ID or an arbitrary provider URL/topic.

Migration `0004_push.sql` adds `push_device` and `push_delivery` to existing D1;
`npm run auth:setup:local` / automatic production releases apply it. Devices are
bound to a server session. Sign-out deletes the session and cascades devices and
queued deliveries. Expired sessions are excluded before sending; reassigning a
device excludes deliveries for its previous session. Deleted contacts/turns also
cascade pending notifications. Already submitted APNs alerts cannot be recalled
on sign-out. Alert payloads now contain contact names and reply text; system
preview settings control their lock-screen visibility. The account check still
prevents opening another account's chat. The client clears delivered alerts and
the icon badge when signing out. Device tokens remain in D1 until
session deletion, explicit unregister, device eviction, or APNs invalidation;
no token or credential values are logged.

Delivery uses ES256 provider JWTs and fixed APNs endpoints, a 15-second timeout,
five concurrent sends, and a bounded batch of 30. An atomic two-minute lease
prevents concurrent Cron/Workflow claims. Transient failures retry with backoff,
up to eight attempts and 24 hours. Invalid/unregistered tokens are removed.
Success deletes the outbox record. `apns-collapse-id` uses the turn ID to coalesce
outstanding retries; an accepted send followed by a crash can still duplicate an
alert. APNs acceptance does not guarantee display: offline devices, Focus, system
permissions, and user settings affect delivery. There is no presence tracking;
APNs receives alerts regardless of app state and the delegate suppresses their
foreground presentation.

## Development, verification, and rollback

Local auth/chats work without APNs secrets. If needed, put the four values in
ignored `.dev.vars`, never source control. Local macOS workerd may not negotiate
the HTTP/2 connection APNs requires, although deployed Workers use Cloudflare's
outbound proxy. Verify real delivery from an authorized automatic cloud release;
do not substitute manual deployment. Staging needs its own Worker, D1, secrets,
API origin and preferably a separate app ID/key scope.

Static TypeScript and Swift checks and plist/project validation cover source
integration. No build, runtime tests, device enrollment, provider key validation,
or real push delivery was performed during implementation. When functional
verification is authorized, use fictional contacts: enroll a device, send a chat,
background/close the app, check the alert, and tap it on a cold launch. Also check
foreground suppression, permission denial/re-enabling, logout/account switching,
contact deletion, sandbox/production signing, and a provider outage retry.

Rollback the code through an authorized commit/push. Keep the additive tables;
older code ignores them. Checkpointed Workflows may require compatibility care
when rolling back `generate-and-save` / `deliver-push`; do not rewrite applied
migrations. Disable the Apple key to stop provider access, or remove runtime APNs
secrets through an authorized configuration operation. Pending entries expire;
no rollback removes already displayed alerts.

References: [Apple registration](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns),
[APNs requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns),
[token authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns),
[Cloudflare HTTP/2 limitation](https://github.com/cloudflare/workerd/issues/4841).

## Current installation configuration (October 26, 2026)

The Apple App ID `com.imlautaro.Wildcard` already has Push Notifications enabled.
An explicitly authorized **Wildcard Push Sandbox** key was registered with
**Topic Specific / Sandbox** access for this app. The four `APNS_*` names above
were saved as encrypted **Workers Builds** secrets for `wildcard-api`; persistence
and encryption status were verified after reloading the dashboard. No key values
are recorded in this repository. The owner retains the original downloaded key.

This configuration supports development-signed Debug installations only. It does
not enable TestFlight/App Store production delivery. Provision a separately
reviewed production configuration before using those distributions; do not reuse
unrelated apps' provider keys. Runtime activation still requires committing and
pushing the pending implementation through the automatic release pipeline, then
installing the updated iOS app. No release or real push was performed for this
configuration step.

## Signing fix and unread state (October 26, 2026)

Production diagnostics confirmed one registered development device and three
queued deliveries with zero attempts. The Cron exception identified Workers'
`node:crypto.sign` rejecting `PrivateKeyObject` before any APNs call. Provider
signing now imports PKCS#8 into Web Crypto and signs ES256 with P-256/SHA-256,
producing the raw 64-byte JWT signature. No key rotation or permission change is
needed. Signing failures and APNs status/reason codes have dedicated logs; accepted
notifications log only environment, never tokens, user IDs, or content.

Unread state is independent of APNs delivery. Migration 0005 adds a contact read
watermark; completed replies above it remain unread across app restarts. Contact
rows and the Chats tab display counts, and active chats acknowledge only the
latest loaded completed sequence. Lists revalidate immediately on activation and
every second, retaining later loaded pages; opening a conversation forces
history revalidation. Fetching a list or history never acknowledges it. See
[contacts](contacts.md) for API, concurrency, migration, and rollback behavior.
Pending pushes for acknowledged replies are removed, and the atomic delivery
claim checks the watermark again. Already accepted/in-flight APNs alerts cannot
be recalled. App-icon badges were added in the subsequent update described below.

Static Swift/TypeScript checks cover the integration. No local build or automated
tests were run. Device display and navigation still require verification using the
updated iOS installation; APNs acceptance is a separate server observation.

## App icon badge and reply previews (October 26, 2026)

The owner explicitly requested the contact name as title, reply text as body,
and the unread-message count on the app icon. This replaces the original generic
alert design. The provider now reads the current contact/reply before sending
and computes the same owner-wide unread total used by the contacts API; no names,
message text, payload bodies, keys, or tokens are logged. Existing APNs credentials,
resources, migrations, and automatic release commands remain sufficient.

The updated iOS app requests `.badge` alongside alert/sound permission and offers
an **App icon badge** permission status in Account. Already-authorized installations
can request the previously omitted badge option through the existing enable flow;
if badges are disabled by the user, system notification settings must enable them.
After loading counts or acknowledging reads, iOS sets the badge to the server total
with `UNUserNotificationCenter.setBadgeCount`; zero removes it. Foreground
activation reapplies the count even if APNs changed it while suspended. Updates
are serialized and coalesced so an older local completion cannot win over a newer
count or sign-out. Read acknowledgements return an authoritative owner-wide total,
including unloaded contact pages. Failed system badge updates retry on the next
activation/count change; Account exposes the failure status.

An arriving background alert updates the icon without running the app. While
foregrounded, banners are suppressed and server polling updates the icon. The
count is a send-time snapshot: delayed/out-of-order APNs delivery or reads on a
different device can temporarily leave a background icon stale until another push
or foreground refresh. No silent background synchronization was added.

No local builds, automated tests, or new inference/push test messages were run for
this update. Static TypeScript/Swift checks cover integration; installed-device
permission behavior, icon display, and preview layout require verification with
the updated client. Rollback ignores the new optional payload/API fields; keep
existing read-state migrations. Older clients still open the alert's conversation.

## Badge permission recovery

Account distinguishes `badgeSetting.disabled` from `.notSupported`; the latter
is shown as **Unavailable on this installation**, not **Disabled in Settings**.
An explicit **Enable app icon badge** action re-requests alert/sound/badge options
for any authorization state other than denied, then reads the resulting system
settings. It does not skip a badge request just because the previous setting was
notSupported. Permission-request failures remain visible instead of being cleared
by subsequent device synchronization. Denied notification authorization still
requires the system settings flow. A missing Badges toggle must not be diagnosed
as a user-disabled switch without checking the actual returned setting. These
changes require installing the updated client; device recovery is unverified.

## Contact avatars

[Contact profile photos](profile-photos.md) add `mutable-content: 1` and, when a
photo exists, a signed `photoURL` to the existing reply payload. JSON size limits
include the URL. The embedded `WildcardNotificationService` downloads the private
image through the Worker and updates the alert using an incoming
INSendMessageIntent. Text/routing/badge remain available when the extension cannot
add an avatar. Foreground presentation remains suppressed.

This adds the private R2 bucket/binding and migration 0006 described in
[infrastructure](infrastructure.md). Create that bucket before the automatic
release, enable Communication Notifications for the main Apple App ID, and sign
and install the updated app with its embedded extension. Both targets must use
the same HTTPS API origin in each configuration. No new APNs secret is required.
The private production R2 bucket was created and verified on October 26, 2026.
Apple capability/provisioning verification and visual presentation on an iPhone
remain pending; static app/extension checks do not establish visible push-avatar
behavior.


## Notification-response completion threading

The app delegate implements the explicit completion-handler forms of both
UserNotifications callbacks. It dispatches routing and completion to the main
queue and calls completion exactly once, including ignored actions or missing
routing fields. Foreground alerts remain suppressed; account/ownership checks
and cold-launch session restoration remain unchanged.

An October 26, 2026 device crash captured in Xcode showed
`PushAppDelegate.userNotificationCenter(_:didReceive:)`'s synthesized async bridge
calling UIKit state-restoration/snapshot completion from a cooperative background
executor. UIKit raised `NSInternalInconsistencyException: Call must be made on
main thread`. Updating the destination through MainActor inside the async method
was insufficient: the synthesized final completion still ran off the main thread.
Explicit main-queue completion removes that async bridge from this path.

Install the updated iOS binary using Xcode to receive this fix; changing server
code or relaunching the old installation cannot change its callback implementation.
If Xcode is still paused at the fatal exception, stop that debug run before running
the updated app. No reinstall/data wipe, credential change, notification clearing,
or backend release is required. Static Swift checks cover the change; a device
retest of a notification tap from a terminated/backgrounded app remains necessary.


## Message sounds (October 27, 2026)

The main app bundles the three owner-supplied Mixkit WAV files in `Wildcard/Sounds`.
Xcode's synchronized app group includes them as resources; keep their filenames
unchanged. The in-app pop and chime are attenuated by 40 dB, and the background
notification flute by 10 dB, relative to the supplied originals, without changing
their duration or metadata. The
original source files remain outside the repository. They are 44.1 kHz, 16-bit PCM,
each shorter than three seconds, within
[Apple's custom notification sound requirements](https://developer.apple.com/documentation/usernotifications/unnotificationsound).

- An accepted outgoing message and a newly completed reply in the visible chat use
  `mixkit-hard-pop-click-2364.wav`.
- A reply from another conversation, or while viewing any other app screen, uses
  `mixkit-alert-quick-chime-766.wav` while the app is active.
- Background/terminated notifications use
  `mixkit-flute-mobile-phone-notification-alert-2316.wav` through `aps.sound`.

Foreground playback uses System Sound Services and does not change the audio
session used by voice recording. System volume, silent mode, audio-session state,
Focus, and notification sound permission can affect audibility. These are ordinary
sounds, not critical alerts. Foreground banners remain suppressed.

The payload includes the stable `turnID`, used with the authenticated account to
deduplicate foreground APNs and polling observations. For the visible chat, APNs and polling never play or consume the sound event
before display. The reply bubble reports its appearance after a cancellable 250 ms
wait for the insertion/scroll animation, rechecking visibility, account and active
state. Deduplication prevents replay when a bubble reappears. Chat refreshes report
newly completed turns for conversations outside the visible chat; contact-list unread increases resolve recent turn IDs through a
history request, allowing foreground sounds even without APNs permission. Replies completed before the current foreground interval do not replay sounds.
Newly completed replies fetched for the first time during the interval can notify;
unchanged history and already announced messages remain deduplicated. Outgoing sounds require server
acceptance, including recovery of an accepted request after a timeout; failed
submissions and reply retries do not play a send sound. State clears on sign-out.

Install the new iOS binary before an authorized automatic backend release uses the
custom APNs sound; older installations without the file fall back to the system
sound. The new payload fields require no migration, binding, capability, or secret.
Rollback through commit/push; older clients ignore `turnID`. Static Swift and
TypeScript validation does not establish audible playback. Verify the three cases,
late push deduplication, background/resume, silent mode, recording, notification
permission denial, and account switching on a physical device with fictional data.
No build, runtime test, or real push was run for this change.


The October 27, 2026 volume adjustment applies -40 dB to the in-app pop and chime
and -10 dB to the background notification flute at the owner's request. Samples are scaled directly from the original files in commit
`6937d4d050f19648ecd29950c4168375bed2b536` to avoid cumulative rounding from earlier
adjustments. The accompanying client change delays the visible reply sound until
its bubble appears and its insertion/scroll animation has finished.
Install the updated iOS binary to apply it to foreground sounds and background
notifications; the API sound filenames stay the same and no backend release is
needed. PCM sample scaling and unchanged WAV parameters were checked locally;
audible loudness on a physical device remains unverified.

## Scheduled contact messages

[Scheduled messages](schedules.md) use the same assistant-reply APNs outbox and
current session/device enrollment. Cancelling or editing a schedule removes
unsent entries and invalidates generation from its old revision. Delivery checks
the schedule immediately before the external request. Already in-flight/accepted
APNs alerts cannot be recalled. Signing out removes this session's enrollment
but does not cancel the user's schedules.

## Shared contacts

[Shared contacts](sharing.md) keep notifications private to the turn recipient. Each participant has a separate contact/conversation ID, read watermark, unread total, schedules, session devices, sound keys, and notification tap destination. Sharing does not fan replies or reminders out to other members. Notification names/photos use the same canonical agent metadata; signed avatar reads resolve its creator/agent R2 object after validating the recipient’s membership/session. Member removal/leave cascades that person’s pending outbox entries; creator deletion cascades everyone’s. Already accepted APNs requests cannot be recalled.

Directed [contact invitations](sharing.md) appear in their own foreground inbox,
refreshed at most every 15 seconds or manually. They do not generate APNs alerts,
mailbox emails, chat turns, message sounds, or unread-message/app-icon badges.
Only the intended signed-in account can accept or decline an invitation.


## Group notifications

Groups now participate in all three notification paths: background APNs alerts,
persistent per-member unread counts and foreground banner/sound presentation.
Migration `0018_group_notifications.sql` adds `group_member.last_read_sequence`
and `group_push_delivery`, with SQL triggers for initial read boundaries and atomic
message fan-out. Existing memberships start caught up; no historical pushes or
inferred unread backfill are created. New members start at join-time history.

An incoming human or bot group message queues each current recipient device;
the human author is excluded. The sender request or Workflow attempts delivery,
and the existing Cron retries. Group outbox rows have device/session/member FKs,
a 24-hour expiry, eight attempts, bounded batches of 30 and five concurrent sends.
A two-minute lease prevents concurrent sends, and final eligibility checks cover
read state, membership, session expiry and device reassignment. Provider signing
and the APNs transport are shared with private pushes. Apple acceptance does not
prove device display, and retries are at least once.

Group payloads use title/group name, subtitle/sender, text or attachment label,
combined unread badge, `groupID`, recipient `userID`, message ID, sequence and
creation time. Long text uses the same UTF-8-aware payload bounding as private
replies. A SHA-256 collapse ID accommodates long bot message IDs. Groups use plain
APNs alerts with the app icon, so they do not invoke the private-contact avatar
extension. No new Apple capability, topic, resource or secret is required.

Group list/detail responses contain per-member counts/read sequence. The list also
returns at most 50 unread activity entries across current memberships for the
foreground polling fallback. The app polls groups approximately every
second while active and updates the row badge, Chats badge and app icon. It waits
for both private/group initial snapshots before replacing the icon badge.
`PUT /api/v1/groups/:id/read` acknowledges only existing displayed history, advances
monotonically and clears queued deliveries for that member. A visible active
group chat records the observation; the session can finish or retry its queued
write from Home. Home and details never create observations from their snapshots. Read revisions protect client state
from stale list responses, and a confirmed read removes corresponding delivered
notifications from the current device.

The delegate treats remote foreground pushes as synchronization hints. After the
list applies fetched activity, iOS schedules group banners outside the visible
group, using the foreground chime. Polling supplies the same path without APNs;
message IDs deduplicate both paths during that foreground session. Inside the
attended group, only the new bubble's in-chat sound plays after insertion. No old
sounds/local alerts replay on activation. Alert permissions continue to apply;
foreground sound follows the existing app behavior. Notification taps restore the
matching account and navigate to the group with server authorization. Sign-out
clears group presentation/read state and scheduled local notifications.

Publish the migration/API automatically from committed/pushed source and install
the updated app. With fictitious members/devices verify: human and bot push while
backgrounded/closed; no author echo; foreground Home banner/chime; no banner and
one sound inside the group; persistent counts after relaunch; combined private+
group badges; read synchronization and late push suppression; notification taps;
logout/account switch; member removal; expired/reassigned devices; retry recovery;
attachment-only messages; and APNs/polling races. No push, runtime tests or device
validation were performed while implementing this change.

References: [Apple foreground presentation options](https://developer.apple.com/documentation/usernotifications/unnotificationpresentationoptions)
and [APNs request headers and limits](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns).

## Synchronization before foreground presentation

Remote foreground APNs callbacks queue a session refresh and suppress immediate
audio/banner presentation. The shared history or Home summary is updated before
notification presentation is requested. Visible chats continue to wait for the
reply row's insertion delay. Audio adds 100 ms for observation updates and checks
the same account, foreground interval and visible conversation again. Group local
notifications use the existing message-ID deduplication. Background/terminated
APNs behavior is unchanged.

The session uses a one-second polling fallback and independent list/history
requests. This interval is not an end-to-end timing guarantee. See
[shared synchronization](caching.md#shared-conversation-synchronization) for
regression commands, lifecycle, cache behavior and device verification. The
isolated checks do not exercise real audio, notification delivery or screen
rendering. Install the updated iOS binary; no API deployment is needed.

Unread-watermark acknowledgements now belong to the signed-in session rather than
a view's cancellable task. A visible private/group chat queues the latest loaded
read sequence synchronously. Leaving does not abandon it; the foreground timer
retries failures independently of list requests, and updates row/tab/icon counts
after server acknowledgement. These intents do not acknowledge unseen Home
previews. See [read acknowledgement lifetime](caching.md#read-acknowledgement-lifetime)
for retention, stale-response protection and pending device verification.

## Markdown-free bot alerts

The API turns bot Markdown into plain text before building private/group APNs
payloads and before applying the existing serialized UTF-8 size bound. This also
covers OS fallback when the iOS notification extension cannot finish: the original
push body is already plain text. Human group alerts stay literal. Link and image
labels are retained; markup delimiters are removed, and code content stays literal.
Group activity includes optional `previewText` plus sender `agentID`; iOS uses the
plain summary for locally scheduled foreground notifications. It falls back to
parsing known bot source for older snapshots. No notification registration, routing,
badge, receipt, photo fetch, consent or storage policy changes. Already delivered
alerts are not rewritten. The API change requires the normal automatic release.
Static API/web/Swift checks passed; actual APNs and foreground device presentation
have not been reverified.

## Initiative replies

Private [initiative](initiative.md) messages reuse completed assistant turns and the transactional APNs outbox, including Markdown-clean previews, contact identity and unread badges. Read acknowledgements suppress queued notifications normally. Disabling initiative prevents future publication and preserves already-published messages and their usual delivery semantics. Browser push remains unavailable; device delivery has not been newly verified.

## Reply sequences

Private multi-message replies keep one unread item, sound and push alert per
completed response turn, using its joined delivered text. A stopped burst preserves
its delivered prefix. Group parts use individual message notifications, receipts
and unread counts. See [successive messages](reply-messages.md) for limitations and
fictional-data device verification; static checks do not establish APNs delivery.
