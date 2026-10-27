# Chat attachments

The composer has a paperclip button to the left of Message. Choose Photo library
or Choose file, inspect the draft thumbnail/name, and remove or replace it before
sending. A message can contain one attachment, with or without text. Sending
immediately moves the attachment into an optimistic outgoing bubble; image
thumbnails use local bytes while the request is pending. A clock indicates sending,
and attachment preview actions wait for server acceptance. The right
button sends when an attachment is selected; dictation remains available for an
empty composer. Failed sends retain the draft and attachment, including the request
identifier for uncertain network results. Images load automatically as square
inline thumbnails up to 260 points wide, using centered aspect-fill (cover):
the image fills the available area without distortion and excess edges are
cropped. Loading and retry placeholders use the same square layout. This applies
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
Voice dictation continues to use the separate transcription endpoint.

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
