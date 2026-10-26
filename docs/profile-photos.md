# Contact profile photos

Contacts can have one profile photo, private to their owner. Photos appear in the
Chats list, conversation title, contact editor, and supported iOS communication
notifications. They do not create system Contacts entries or enable sharing.

## Native editing

Choose **Edit** from a chat row's swipe/context menu or tap the conversation title.
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

## API and storage

The existing contact responses add nullable `photoVersion` (an opaque UUID).
Older responses without this property remain decodable by the updated client.
No owner ID, R2 key, or permanent public image URL is exposed in those responses.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/contacts/:id/photo` | Read the owner's current JPEG; optional `version` must match |
| PUT | `/api/v1/contacts/:id/photo` | Replace with raw `image/jpeg`; returns the updated contact |
| DELETE | `/api/v1/contacts/:id/photo` | Remove the image; returns the updated contact |

All three require the existing signed bearer session and check ownership in D1.
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

Reads use `private, no-store`, a fixed JPEG content type, and `nosniff`. iOS uses
an ephemeral authenticated URLSession and an NSCache of encoded image bytes with
a 16 MiB cost limit, scoped to the signed-in ContactsStore and keyed by contact and
version. Versions invalidate visible avatars; logout/account switching discards
the store. There is no persistent image cache or public bucket delivery.

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
