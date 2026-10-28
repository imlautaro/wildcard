# Contact profile photos

Agents can have one profile photo, visible to their authorized participants and editable only by their creator. Photos appear in the
Chats list, conversation title, contact editor, and supported iOS communication
notifications. They do not create system Contacts entries. [Shared contacts](sharing.md) reuse the canonical creator/agent R2 object without copying bytes.

## Native editing

Choose **Edit** from a chat row's swipe/context menu or tap the conversation title.
The contact editor and Account share `ProfileIdentityView`: a centered circular
avatar with a smaller camera circle at its bottom-right corner, with the name
centered below. Tap the avatar to open **Choose Photo** and, when a photo exists,
**Remove Photo**. Tap the name to open **Edit name**, then enter and confirm the
name in a native alert. A new contact displays **Add name** until named. Members
who cannot manage a shared contact see the same identity without editing menus.

The same photo controls are available when creating a contact. **Choose Photo**
uses the system Photos picker without requesting access to the entire library.
The crop sheet supports dragging, pinching, and a zoom slider with a circular
avatar guide. **Use Photo** prepares a square image; **Cancel** keeps the previous
draft. **Remove Photo** restores the placeholder when saved.

ImageIO downsamples the selected image to at most 2048 pixels before editing and
applies its orientation. The crop renders a new 512 × 512 JPEG at 0.85 quality,
without copying source EXIF/GPS metadata. Uploads are limited to 512 KiB. Photos
are saved only after Create/Save. Name and photo use separate requests: if the
photo fails after saving the name, the editor retains the contact ID and selected
photo and offers Save to retry without creating another contact. A new contact
can therefore remain without a photo after a network failure.

## Web editing

Account and existing owned contacts share a manual **Crop Photo** dialog. Selecting
a file opens a local preview; drag with a mouse or touch to reposition, pinch or
use the **Photo zoom** slider (1–4×), and choose **Use Photo** to confirm. Arrow
keys move the image when the preview is focused; Shift increases the step. The
circular guide previews the avatar inside the square upload. **Cancel** or Escape
keeps the previous photo and sends no request. The modal traps focus using the
native dialog element and restores focus on close.

The browser applies image orientation, bounds the editor source to 2048 pixels,
and renders the confirmed crop to a 512 × 512 JPEG on white. Re-encoding strips
source metadata and reduces JPEG quality if needed to stay below 500 KiB. The
selected source is memory-only and released on cancel, confirmation, navigation,
loss of editability, or account change. Late decode/encode completions cannot
apply a canceled selection. Existing session-owned upload and versioned avatar
cache behavior is unchanged; no request starts before confirmation.

This web-only change brings these editors in line with the existing iOS cropper.
Web contact creation and group photo editing remain unavailable as described in
[web limitations](web.md). Static checks do not verify browser interactions.
Pending manual checks with fictional images: portrait/landscape and EXIF rotation,
mouse/touch dragging, pinch/slider zoom at image edges, keyboard/focus/Escape,
cancel and reselect the same file, transparent images, unreadable/small files,
upload failure recovery, navigation during decode/encode, and account switching.

## API and storage

The existing contact responses add nullable `photoVersion` (an opaque UUID).
Older responses without this property remain decodable by the updated client.
No owner ID, R2 key, or permanent public image URL is exposed in those responses.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/contacts/:id/photo` | Read the owner's current JPEG; optional `version` must match |
| PUT | `/api/v1/contacts/:id/photo` | Replace with raw `image/jpeg`; returns the updated contact |
| DELETE | `/api/v1/contacts/:id/photo` | Remove the image; returns the updated contact |

All three require the existing signed bearer session. Reads check participant membership in D1; writes additionally require creator ownership.
A missing/foreign contact or absent photo returns 404; missing auth returns 401.
Uploads count streamed bytes, reject more than 512 KiB with 413, require JPEG with
415, and check JPEG markers and square dimensions of 64–1024 pixels with 422.
This is structural validation, not a server-side image decode or transformation.
The app always re-encodes its crop. Uploads have an atomic owner-wide allowance of
12 per minute; 429 includes Retry-After. Concurrent photo changes use a D1
compare-and-swap and return 409 on conflict rather than overwriting a newer photo.

Migration `0006_contact_photos.sql` adds nullable `contact.photo_version`. R2
binding `CONTACT_PHOTOS` stores bytes under
`contacts/<owner>/<contact>/<version>.jpg`. Each upload has a fresh version/key;
D1 switches references only after R2 accepts the write. Failed publication and
superseded photos request cleanup; deleting a photo/contact also requests cleanup.
Cleanup is best effort and logs only `contact_photo_cleanup_failed`, without
keys or personal data. Interrupted requests or storage failures can leave private
orphan objects; there is no background orphan sweeper. Future account deletion
must also clean R2 because SQL cascades cannot delete objects.

Reads use `private, no-store`, a fixed JPEG content type, and `nosniff`. Network
misses use an ephemeral authenticated URLSession. The app shares decoded-avatar
memory and a protected, account-scoped disk cache with chat images; see
[recent image caching](caching.md#recent-chat-images-and-avatars) for budgets,
expiry, file protection, and invalidation. Keys include contact ID and version,
so a changed photo cannot reuse the previous version. Accepted uploads seed the
cache. Sign-out/session expiry clear cached bytes. There is no public bucket
delivery; the cache does not alter server authorization or HTTP cache policy.

## Push avatars

APNs alerts include `mutable-content: 1`. When a contact has a photo, the provider
adds a signed HTTPS `photoURL` limited to that contact version, receiving session,
and at most the remaining 24-hour delivery window. It uses a domain-separated
HMAC-SHA256 with the existing runtime auth secret; no additional secret is needed.
The Worker verifies the signature, expiry, current photo version, and live owner
session before streaming R2 bytes. Removing/replacing the photo or deleting the
session revokes subsequent reads. The URL is a temporary bearer capability;
never log it, distribute it, or place it in analytics. APNs processes this URL
alongside the already-requested contact name and reply text.

The embedded `WildcardNotificationService` downloads only from the configured
HTTPS API origin and `/api/v1/push-photos/` path. It rejects redirects, limits the
response to 512 KiB, and uses a 15-second resource timeout. It creates an
INSendMessageIntent with the contact as sender and the account as recipient,
donates the incoming interaction, and updates the notification with the sender
image. System communication notifications use these donations for suggestions.
No system Contacts permission, shared Keychain, App Group, or general session
token in APNs is needed. Original text notifications remain available if download,
intent conversion, donation, or extension execution fails or expires. Photo
changes do not retroactively update an already delivered notification.

Enable the app's **Communication Notifications** capability and sign both the app
and embedded extension with your own team/identifiers. Set the same
`WILDCARD_API_URL` for both targets and configurations. Apple provisioning and
physical-device presentation must be verified separately; iOS controls final
layout, notification previews, Focus behavior, and whether it executes the extension.
See [notifications](notifications.md) and [infrastructure](infrastructure.md).

## Reproduction and validation

Provision the private bucket before an authorized commit/push release, following
[infrastructure](infrastructure.md). Local Wrangler emulates R2 without remote
bindings; local setup applies the new D1 migration. Production migrations are
applied only by the existing automatic release. Keep staging in separate buckets,
Workers, databases, app IDs, and API origins. Neither r2.dev nor a public domain,
CORS, S3 credentials, Cloudflare Images, nor a new image processing service is needed.

Static TypeScript, Swift app/extension, plist/project, and script checks passed.
The production R2 bucket was subsequently created and verified private on
October 26, 2026. No local migration, build/test, iPhone installation, or push
was performed for this change; production migration and code publication use
the authorized automatic commit/push release. Functional checks with fictional contacts
remain: portrait/landscape crop, cancel/remove, upload retry, replacement/deletion,
logout/account switching, two-owner isolation, invalid/oversized JPEGs, tampered/
expired/revoked URLs, and a real background push on a signed physical iPhone.

Rollback through an authorized commit/push. Keep the additive D1 column and R2
bucket/data; older code ignores the new fields. Never delete the bucket to roll
back code. Restoring code does not recover replaced/deleted photos. Export D1
metadata and corresponding R2 objects together when making backups.

References: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[Apple communication notifications](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications).

## Shared identity photos

Migration 0013 projects the canonical name/photo version to all participant conversation records. Authenticated reads and signed notification-avatar reads first validate the recipient’s private contact/session, then resolve the original creator/agent storage key. Removing a member revokes their subsequent reads and does not delete the shared photo. Creator deletion removes the shared object with the existing best-effort cleanup.

## Account profile

Account displays your current name, email, and photo. The shared avatar/name
controls are editable directly in Account; there is no separate Edit Profile
screen or profile-wide Save button. Confirming a name saves only the name.
Choosing **Use Photo** in the cropper saves only the photo; **Remove Photo**
persists removal immediately. Canceling a picker, cropper, or name alert makes
no change. The shared control reuses the contact cropper and JPEG preparation
described above. Failed writes show an inline error and Retry, retaining the
submitted name or cropped photo until another edit replaces it. Controls and
sign-out are disabled during an update. Contact editing still stages changes
until Create/Save, including its existing partial-save recovery.

Account refreshes the profile when opened and waits for that refresh before
enabling profile editing to avoid overwriting a new edit with the opening read.
Authentication responses may omit the optional photo version; the client reads
the canonical profile from `/api/v1/me` after sign-in.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/me` | Current user, including nullable `photoVersion` |
| PATCH | `/api/v1/me` | Exactly one `name` field; returns the updated user |
| GET | `/api/v1/me/photo` | Current JPEG; optional version must match |
| PUT | `/api/v1/me/photo` | Replace with a raw square JPEG; returns the updated user |
| DELETE | `/api/v1/me/photo` | Remove photo; returns the updated user |

Every route requires a signed bearer session and derives the user ID exclusively
from that session. Names are trimmed, nonempty, limited to 100 Unicode scalars,
and reject control characters. Photos have the same streamed 512 KiB limit,
content-type and structural JPEG checks as contact uploads. Photo writes share
a per-account allowance of twelve changes per minute. Concurrent changes use
compare-and-swap and return 409 rather than replacing a newer photo.

Migration `0015_account_photos.sql` adds nullable `user.photo_version`; it does
not repurpose Better Auth's image URL. The existing private `CONTACT_PHOTOS` R2
binding stores `users/<user>/<version>.jpg`. Only the account owner can read
these bytes; they are not exposed through contact sharing or push-avatar URLs.
Reads use private/no-store headers. Account avatars use the same protected
[recent image cache](caching.md#recent-chat-images-and-avatars), keyed by the
account photoVersion; a new version selects new bytes immediately.
Replacements/removals request best-effort R2 cleanup with the existing helper;
interrupted requests can leave orphan objects.
Future account deletion must clean this prefix as well as contact objects.

No new service, secret, bucket, capability, or Photos-library permission is
required. Local setup and automatic releases apply the additive migration using
the existing process in [infrastructure](infrastructure.md). Keep the column and
private objects during code rollback; older code ignores the added profile field.
Functional validation remains pending: name/photo persistence after re-login,
crop/cancel/remove, photo retry after a saved name, concurrent writes, invalid
uploads, and isolation between two fictional accounts.


Group members explicitly accept sharing their display name and current profile photo with co-members. Authenticated group photo routes check current group and target membership, without granting private-contact or account-edit access. See [groups](groups.md).


## Group identity

Group creation and details reuse the avatar/name editor and cropper. Only the group
owner edits these fields; current members may read the photo. Migration 0017 adds
`chat_group.photo_version`. JPEGs use `groups/<groupID>/<version>.jpg` in the existing
private R2 bucket, the same dimensions/size validation and compare-and-swap pattern.
Header/list avatars use the existing protected image cache with distinct group
keys. See [groups](groups.md#group-photos-attachments-and-voice) for endpoints,
cleanup, limits and validation still needed on a device.

## Generated onboarding portraits

[First-circle onboarding](onboarding.md) uses Meta Muse Image 1.0 for five private
JPEG portraits. Unlike manual uploads, generated images may be up to 4096 pixels
square and 8 MiB; Meta's requested size specifies aspect ratio. Upload limits and
validation stay unchanged. Generated portraits use the same authenticated photo
routes, immutable versions, access-scoped cache keys and deletion paths as normal
contact avatars. Partial setup images remain private in R2 for retries until setup
completes; no separate image cache or public URL is introduced.

## Profile images available to contacts

Contacts can call `view_profile_photo` when visual profile context helps a reply.
In private chats they can inspect their own canonical avatar and the current
human's account photo. In a group they can also inspect the current human and
agent members' avatars using roster IDs. Private calls cannot fetch other members'
photos through shared-group search. This capability is shared by iOS and web;
no additional picker, attachment, switch, or client update is required.

The read-only tool returns an immutable identity/version reference. Before every
subsequent inference, the server checks current conversation access, membership,
shared-memory and Contributor consent where applicable, and the exact current
photo version. It reads private R2 bytes through the existing binding and checks
access/version again after reading. Missing, removed, replaced or inaccessible
photos produce an unavailable marker; no old bytes or replacement photo are
silently substituted. A new tool call can request a replacement. Names and image
text are untrusted evidence. Avatars do not establish real identity or appearance,
and the contact is instructed not to infer sensitive traits or invent unseen details.

Each inference includes at most three distinct photos and 8 MiB of combined JPEG
bytes, supporting generated onboarding portraits within that budget. Duplicate
reads for one member select the last requested version. Reads consume the existing
conversation tool budget. Images are sent to that conversation's selected model
only after a photo tool call; they are not automatically attached to every turn.
Connector conversations retain Standard processing and their existing isolation.

There is no new public URL, endpoint, database migration, bucket, secret, or
infrastructure configuration. Group Workflows checkpoint identity/version
references only; image bytes are loaded inside inference steps and never returned
from those steps. Model inputs are transient; no new image cache or stored visual
summary is introduced. Existing memory extraction and chat retention stay in place.
Client avatar caches and upload/remove invalidation are unchanged; see [caching](caching.md).

Static verification does not establish visual quality or functional behavior.
Pending checks with fictional data: own/user photos in private chat, human and
bot photos in a group, missing photos, replacement/deletion between tool and
inference, membership/consent revocation, Contributor/Standard selection, isolated
connector chats, repeated calls, image budgets, and equivalent replies from iOS
and web. Live model calls and device/browser validation require separate execution.
