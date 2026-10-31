# Chat attachments

On the web, private and group chat images (including generated contact images)
preserve the original image composition for both optimistic previews and saved messages.
Clicking a loaded thumbnail opens the full image in a black modal in the same tab.
The modal provides Close, Escape, Zoom in/Fit image, double-click zoom and scrolling
when enlarged. It reuses the thumbnail's cached original blob URL without another
request or a separate cache; pending images reuse their local preview URL.
Closing restores focus. Source/account changes and navigation dismiss the viewer.
PDFs retain their separate temporary blob preview. iOS keeps its existing native
viewer and gestures. Verify portrait/landscape images, captions, generated images,
small viewports, keyboard focus, zoom, back navigation, offline reopening and
account switching in a browser; static validation does not confirm these behaviors.

The composer has a paperclip button to the left of Message. Choose Photo library
or Choose file, inspect the draft thumbnail/name, and remove or replace it before
sending. A message can contain one attachment, with or without text. Sending
immediately moves the attachment into an optimistic outgoing bubble; image
thumbnails use local bytes while the request is pending. A clock indicates sending,
and attachment preview actions wait for server acceptance. The right
button sends when an attachment is selected; the [voice message](voice.md)
microphone replaces it only when the composer is empty. Failed sends retain the draft and attachment, including the request
identifier for uncertain network results. Images load automatically as inline thumbnails up to 260 points wide and
360 points tall, preserving the full image with aspect-fit:
the complete composition remains visible without distortion or cropped edges. Loading and retry placeholders retain a square layout. This applies
to optimistic previews and saved messages, with or without captions.
When sent with text, the caption appears below the image inside the same outgoing
bubble. Captions share the text-message layout: short single-line text keeps the
time and receipt checks on its line; longer or multiline text puts them below. Image-only messages keep
the metadata overlay.
Images use a rounded outline with an integrated pointed tail at the bottom right
for outgoing messages, or bottom left for incoming group messages, in the matching
bubble color, replacing the decorative circle. A 2-point border
in that same color surrounds the image, including images with captions. The tail
tip has a rounded cap. The image itself has independent 16-point rounded corners (smaller than the 20-point bubble)
inside a 2-point bubble-colored rim. With a caption, both lower image corners
use a minimal 2-point radius where the image meets the text. They align to the same
trailing edge as outgoing text bubbles. For image-only messages, a dark badge at the bottom right shows the
message time and the same server acceptance/agent-read checks used by text messages. They use persisted `readAt`, remain muted while queued, and do not certify human reading or APNs delivery. Tap
an image to open a black full-screen viewer with pinch/pan, double-tap zoom, and a
Close button. Drag down at the default zoom level to dismiss: the image follows
the finger and closes after a sufficient downward drag or a short fast swipe.
Short or cancelled drags return the image to its position. When zoomed in,
dragging continues to pan the image; zoom out before swiping to dismiss. Documents continue to open in native Quick Look. Failed image loads
show retry controls; full-screen loading also supports retry and dismissal.

## Formats and limits

This implementation accepts JPEG, PNG, GIF, WebP, and PDF, up to 5 MiB per file.
These are application limits, narrower than Meta's provider limits. The Files picker
preserves bytes; Photo library selection converts to JPEG with a maximum 2048-point
long edge rendered at scale 1, with a white background for transparency. The selected
photo representation must also fit 5 MiB before conversion. Camera capture, multiple
attachments, Word/Excel documents, video, and audio file input are not offered.
Recorded [voice messages](voice.md) use a separate `voice` body field, not attachments.

The API validates base64, MIME allowlist, file signatures, name, and size before
storage; this is format validation, not a malware scan or full file parser. The model
can reject malformed content even if its file signature is valid. PDF handling at
Meta includes text from the first 100 pages and visual content from the first 50;
longer documents are partial. See [Meta file handling](https://dev.meta.ai/docs/file-handling)
and [image understanding](https://dev.meta.ai/docs/image-understanding).

## API and storage

`POST /api/v1/contacts/:id/chat/turns` accepts the existing fields plus optional
`attachment: { name, mimeType, data }`, where `data` is standard base64. Empty `text`
is valid only with an attachment. Total JSON request size is bounded to 7 MiB +
32 KiB; decoded file bytes must fit 5 MiB. Omit `attachment` for text-only sends.
Use the same message UUID and content to recover an uncertain send. Identical
retries return the existing turn; different text or file metadata/digest returns 409.

Turn responses include optional `attachment: { name, mimeType, size }` without any
object key or base64 bytes. `GET /api/v1/contacts/:id/chat/turns/:turnID/attachment`
requires the owner's bearer session and returns private, non-cacheable bytes with
an attachment disposition. There are no public or provider-fetchable file URLs.
Image thumbnails and full-screen images share the account-scoped
[recent image cache](caching.md#recent-chat-images-and-avatars): decoded thumbnails
in memory and protected original bytes on disk, capped at 64 MiB per account with
a seven-day disk idle expiry. Cached recent images survive navigation and app
restarts after successful session restoration. A fullscreen cache hit reuses the
original without another download; a miss requires authenticated network access.
Accepted outgoing images seed the cache; unaccepted optimistic previews remain
local view state. Decoding happens outside the main actor with ImageIO downsampling
(520-pixel thumbnails, up to 4096 pixels in the full-screen viewer); orientation
is applied. Animated images display their first frame.
Document Quick Look uses a protected temporary file removed on dismissal or leaving the view;
files left by a process crash can remain in the OS temporary directory until purged.

Migration `0012_chat_attachments.sql` adds turn metadata and a durable object registry.
Bytes use the existing private `CONTACT_PHOTOS` R2 binding, under a distinct
`attachments/` prefix. Each request writes a new immutable object before atomically
accepting the turn in D1. The registry tracks uploads even if acceptance fails.
The existing minute Cron deletes up to 20 unreferenced objects older than 24 hours
per invocation, including files left after contact deletion. Referenced files are
retained with the conversation. Contact deletion immediately revokes access; physical
R2 cleanup is deferred. Failed cleanup retries on later Cron invocations.

The Workflow reads the file from R2 and sends an inline `image_url` or `file` block
to Meta Chat Completions, without adding provider Files API storage. At most one
file is included per model request: the current file, or the latest attachment
within the existing eight-turn/12 KB history budget for follow-up questions.
Other historical files are represented by name only. Search and memory extraction
use message text; they do not index, extract, or remember attachment bytes. An
attachment-only message uses a neutral description/summary prompt for inference.
Embedded file instructions do not authorize schedule tools or override system rules.

Files sent for inference use the configured Meta model and its data policy. The
owner's Contributor configuration also applies to attachments; this feature does
not grant new consent or authorize uploading other people's private data.

## Setup and verification

No additional services, secrets, or public bucket permissions are needed. Follow
[infrastructure](infrastructure.md) to provision D1 and the existing private R2
bucket in an independent account. Apply migration 0012 locally with the normal
local migration command. Production migration/release must run through commit,
push, and the automatic pipeline; install the updated iOS app separately.

Verify using fictional files: supported formats, attachment-only/text-plus-file
sends, removal/replacement, invalid or oversized files, offline retry without a
duplicate turn, inline images, full-screen image opening/zoom/rotation/closing,
image retry after a network failure, document Quick Look, a follow-up question, and denial from a different
account. Confirm deletion immediately blocks download and later Cron cleans R2.
These end-to-end checks and real Meta file inference have not been run by the agent.

The schema is additive. Older clients can read turn responses but cannot display
attachments or send them. On code rollback, keep migration 0012, the registry,
and R2 objects; dropping the metadata loses file references. Restore compatible
code and Cron cleanup before considering any data removal.

## Shared contact access

Attachments remain private to the participant conversation, even when its agent is shared. Shared-memory retrieval does not expose other participants’ file bytes, history, or attachment endpoints. New members start empty histories. See [sharing](sharing.md).


## Group attachments

Group messages use the same formats, 5 MiB validation, private bucket, object
registry, preview views and image cache. Downloads require current group
membership; history omits object keys. The Cron keeps objects referenced by either
private turns or group messages. Each group contact can analyze the current file
(or most recent eligible group file) within its existing exclusive attention turn.
See [group media](groups.md#group-photos-attachments-and-voice) for the routes,
source consent, visibility and cleanup behavior.

Generated contact images use the same private R2 attachment registry and 5 MB
limit. Group images are ordinary messages; private assistant attachments are in
delivered message metadata and use the ownership-checked attachment endpoint with
`?side=assistant`. Incoming image/caption UI, quotes and shared image caches match
on iOS and web. See [generated images](generated-images.md).

A contact-generated [album](generated-images.md#albums) (two or three images on one
message) keeps `attachment` as its first image and adds `attachments` with every
image. `GET /api/v1/contacts/:id/chat/turns/:turn/attachment?side=assistant&image=N`
and `GET /api/v1/groups/:id/messages/:message/attachment?image=N` return album image
N (0–2); without `image` they return the first or only image as before. Human
uploads remain single attachments. Quoting an album message shows it as a photo
(its first image).

## Shared in this chat

Chat details show a WhatsApp-style **Shared in this chat** section with two tabs:
**Media** (a three-column grid of square image thumbnails) and **Docs** (a list of
files with name, size, sender in groups, and date). On iOS it is a section of
contact details (**Edit Contact**/**Contact**) and group details, with a segmented
picker; on web it is the same section on `/contacts/:id/edit` and
`/groups/:id/members`. Tapping a thumbnail opens the existing full-screen image
viewer; tapping a file opens it the same way as in the chat (Quick Look on iOS, a
temporary blob tab on web). Private chats list both your attachments and contact
images (generated images), but only from your own private chat with that contact.
Groups list every member's attachments in the group history. The Docs tab lists the chat's
[Markdown documents](documents.md) first, with **New document**, then shared files.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/contacts/:id/chat/media?kind=image\|file&before=` | Newest first, from both sides; `side` is `user` or `assistant` |
| GET | `/api/v1/groups/:id/media?kind=image\|file&before=` | Newest first, with `senderName`, `userID`, `agentID`; requires membership |

A page covers up to 30 messages for images and 60 for files.
Each item has `messageID`, `sequence`, `createdAt`, `name`, `mimeType` and `size`.
Each image of a contact-generated album is a separate item with an `image` index
(0–2) for the attachment route's `image` query; single attachments omit it. A page
still counts messages, so an album page can hold more than 30 items.
`nextBefore` is the sequence cursor for the next page, or `null`. Items reuse the
existing attachment download routes, so thumbnails share the chat's image cache
keys and no bytes are downloaded twice. No migration is needed; the queries use the
existing `(contact_id, sequence)` and `(group_id, sequence)` history indexes and
filter by the stored attachment MIME type. See [caching](caching.md#chat-details-media).

Bandwidth and memory: there is no thumbnail endpoint, so the grid downloads the
original image bytes (up to 5 MB each) for every visible page, which is why image
pages are limited to 30 messages. Web loads each page's images on render; iOS loads
them as cells appear inside one form row, so a page may load at once. The bytes go
to the existing bounded image caches (see [recent chat images](caching.md#recent-chat-images-and-avatars)).
A server-side thumbnail would reduce this and is not implemented.

Validation: API and web TypeScript and a full iOS Simulator Swift typecheck. Not yet
checked in a browser or on a device: grid layout on narrow screens, pagination,
opening images/files from details, and invalidation after leaving a group.


Image generation uses current avatars for requested selfies and named members, and
can retrieve photos sent by people or contacts in this same chat as scene/edit
references. Internal visual descriptions are server-only and are not shown in
captions, public history or media grids. Both iOS and web use the shared API and
the existing delivered-image viewer/cache; no client format changes are needed.
See [image references and descriptions](generated-images.md#internal-image-descriptions-and-retrieval)
for scope, lazy old-history indexing, limits, retention and verification.

## History cleanup

[Clear/delete](chat-lifecycle.md) register immutable image/PDF/voice keys and generated media for durable R2 deletion, with a final delayed sweep for in-flight uploads. Source indexes and client media/image/audio caches are invalidated. Archive preserves files. Live R2 failure/retry verification is pending.
