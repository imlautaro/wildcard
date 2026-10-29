# Voice messages

People send recorded voice messages to contacts and groups, as in WhatsApp. Contacts
can answer with their own synthesized voice (ElevenLabs). Voice messages are
transcribed after sending, never before, and the transcript is hidden from the chat:
long-press a voice message and choose **View transcript**.

This replaces the earlier dictation flow (record, transcribe, edit, send). The
`/transcriptions` routes remain for older clients only.

## Sending a voice message

When the draft is empty and has no attachment, the composer shows a microphone.

- **Hold to record.** Pressing the microphone starts recording (the first press may
  only show the permission prompt). Releasing it stops recording and sends the
  clip immediately.
- **Slide left to cancel.** While holding, dragging left past the cancel threshold
  (about 100 points/pixels) discards the recording. The bar shows "‹ Slide to cancel".
- **Slide up to lock.** Dragging up past the lock threshold (about 80 points/pixels)
  keeps recording hands-free. The locked bar shows **Delete** (discard) and **Stop**,
  which stops and sends at once.
- Recording stops automatically and sends at 60 seconds. Clips shorter than half a
  second are discarded with the hint "Hold to record, release to send."
- A timer and a pulsing red dot show while recording. Leaving the chat, backgrounding
  the app (iOS) or hiding the tab (web) discards an active recording.

The clip is converted to mono 16-bit PCM WAV at 16 kHz (the format both clients
already produced for dictation) and sent with the message UUID. The outgoing voice
bubble appears immediately with the clock indicator. A failed send keeps the clip and
UUID for **Retry**, exactly like text and attachment sends.

## Voice bubbles

A voice bubble shows a play/pause button, a progress bar, the elapsed time while
playing (the duration otherwise), the send time and, for outgoing messages, the usual
receipt checks. Only one voice message plays at a time; starting another pauses the
current one. Playback continues while scrolling and stops when leaving the chat.

Outgoing voice messages show a microphone icon next to the duration:

- grey while no contact has listened;
- **blue (the same color as the read checks)** once a contact starts listening, which
  is when it starts transcribing the message (`voice.listenedAt`).

Read checks keep their existing meaning (`readAt` in private chats, the aggregate
receipt state in groups). In a private chat the contact reads the message, then
listens, then answers. In a group the microphone turns blue when the first contact
listens.

Long-press any voice message for the usual reactions/reply menu plus
**View transcript**. The transcript appears in a sheet (iOS) or dialog (web):

- "Transcribing…" while `voice.transcript` is `null`;
- "No speech was detected." when it is an empty string;
- the text otherwise. Contact voice messages always have a transcript (it is the
  text that was spoken).

Chat previews, Home rows and notifications show **Voice message** instead of text.

## When contacts reply with voice

A contact replies with a voice message only when **all** of these hold:

1. The super admin flag `voice_messages_enabled` is on (see [admin](admin.md)).
2. `ELEVENLABS_API_KEY` is configured on the API Worker.
3. The participant turned on **Voice messages** for that contact (private chats), or
   the contact's creator did (groups).
4. The message suits speech: 60–600 Unicode characters, and no code, links,
   lists, tables or headings.
5. It is the only voice message in that reply. In a multi-message reply, at most the
   first eligible message is spoken; very short ("ok!") and long answers stay text.
6. The message has no generated image.

The model is told whether voice is on (`voiceInstruction` in
`apps/api/src/voice/catalog.ts`): with the opt-in on, it knows suitable messages are
spoken and writes requested voice messages as plain prose of that length; with the
opt-in off, it says the person can turn on Voice messages in contact details.
Without this, contacts denied sending audio in a message that was then spoken.

Thresholds live in `apps/api/src/voice/speech.ts` (`voiceSuitable`). Synthesis failure
never fails the reply: the message is published as text.

Speech uses `POST https://api.elevenlabs.io/v1/text-to-speech/:voiceID` with model
`eleven_multilingual_v2` (it follows the contact's language) and `mp3_44100_128`
output. Duration is derived from the constant 128 kbps bitrate.

## Contact voices

Every contact has a voice (`contact_agent.voice_id`), part of its shared identity: all
participants hear the same voice, and only the creator can change it.

- **AI-generated contacts** get a voice that matches the requested gender and age:
  `young` under 35, `middle_aged` from 35 to 59, `old` from 60. The choice is
  deterministic per contact among matching voices, falling back to the nearest age
  group (old → middle-aged, young → middle-aged), then gender only, then any voice.
  The default catalog (21 voices, verified on October 29, 2026) has a single old
  voice (male), so older women get middle-aged voices.
- **Other contacts** (manual, onboarding) get a voice the first time one is needed,
  using the gender/age stored at generation when present, otherwise any voice.
- **Contact details** show a **Voice** section when the feature flag is on: a
  **Voice messages** switch (each participant's own opt-in; on by default in the creator's
  conversation with AI-generated contacts, off for other contacts and for people who
  join a shared contact) and, for the creator, a voice picker with a
  sample play button. Shared participants see the voice name read-only.

The catalog is the ElevenLabs account's default voices, read from
`GET https://api.elevenlabs.io/v2/voices?voice_type=default&page_size=100` with its
`gender`, `age`, `accent` and `description` labels. It is cached for one hour per
Worker isolate.

## API

All routes use the bearer session and return `no-store` unless noted.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/me` | Returns `features: { voiceMessages: boolean }` next to `user` (flag on **and** key configured) |
| GET | `/api/v1/voices` | `{ voices: [{ id, name, gender, age, accent, description }] }`; 503 when unavailable |
| GET | `/api/v1/voices/:voiceID/preview` | Sample audio (`audio/mpeg`) proxied from ElevenLabs; 404 for unknown voices |
| PUT | `/api/v1/contacts/:id/voice` | `{ "voiceID": "<catalog id>" }`, creator only (403 otherwise); returns `{ contact }` |
| PUT | `/api/v1/contacts/:id/voice-messages` | `{ "enabled": true }`, this participant's opt-in; returns `{ contact }` |
| POST | `/api/v1/contacts/:id/chat/turns` | `{ id, text: "", voice: { data: "<base64 WAV>" } }` sends a voice message |
| GET | `/api/v1/contacts/:id/chat/turns/:turnID/attachment` | User voice audio (`audio/wav`); `?side=assistant&part=<index>` for a contact voice message (`audio/mpeg`) |
| POST | `/api/v1/groups/:id/messages` | `{ id, text: "", voice: { data: "<base64 WAV>" } }` |
| GET | `/api/v1/groups/:id/messages/:messageID/attachment` | Voice audio of a group message |

Contacts gain `voiceID` (string or null), `voiceName` (string or null) and
`voiceMessagesEnabled` (0 or 1, like `initiativeEnabled`).

`voice` is optional in send bodies and excludes `attachment`; `text` must be empty.
The WAV must be mono PCM16 at 16 kHz lasting 0.25–60 seconds (2 MiB maximum). A
repeated send with the same UUID and the same audio returns the existing message;
different audio returns 409. Invalid audio returns 400.

Messages carry a nullable `voice` object:

```json
{ "durationMs": 4200, "listenedAt": 1767000000000, "transcript": "See you at eight." }
```

- Private turns: `turn.voice` for the person's voice message. `userText` is `""` and
  `attachment` is `null` for voice turns.
- Contact replies: each `assistantMessages[i].voice`; `text` is the spoken text and
  `attachment` is `null`. `listenedAt` is always `null`.
- Groups: `message.voice` for both people and contacts. Human voice messages have
  `text: ""`; contact voice messages keep the spoken text in `text`.

`listenedAt` is `null` until a contact listens; `transcript` is `null` until the
transcription finishes and `""` when no speech was found. A private voice turn whose
transcription fails ends `failed` with `errorCode: "VOICE_TRANSCRIPTION_FAILED"` and
can be retried with the existing retry route.

## Processing

**Private chats.** The chat workflow marks the turn read, waits a beat, sets
`listened_at` (blue microphone), transcribes the stored WAV with Muse Voice
Transcribe and saves the transcript as the turn's `user_text`, so memory, search
and history use what was said. The contact then "listens" for the clip's duration
(at most 60 seconds) before typing. The model receives the transcript marked as a
voice message. Voice turns are never batched with neighboring text messages.

**Groups.** A voice message is transcribed once, by the first contact reply job of
its round, after the round's read step. Jobs in a group are serialized, so later
contacts reuse the stored transcript. Groups without contacts never transcribe;
their voice messages show "Transcribing…" indefinitely. Contact replies in groups use
the same suitability rules and the contact creator's opt-in; only single-message
replies can be spoken.

## Storage, privacy and cost

Audio is stored in the existing private R2 bucket under the same prefixes as
attachments (`attachments/…`, `group-attachments/…`) and registered in
`chat_attachment_object`, so contact/group/account deletion and the orphan cleanup
cron remove it. History returns no storage keys. Audio downloads require the same
access as attachments.

User audio goes to Meta for transcription. Text chosen for speech goes to ElevenLabs;
the flag and per-contact opt-in are the controls. Provider retention and training
policies are outside this implementation. Each spoken message is a paid ElevenLabs
request; each transcription is a Meta request.

## Client caching

Voice audio uses the existing session-owned conversation stores for metadata. Bytes:

- **iOS:** a protected disk cache with the same policy as private images (complete
  file protection, 64 MiB per account, seven-day idle expiry), keyed by account,
  conversation, message ID, side and part. Account switch and sign-out clear it.
- **Web:** an in-memory cache of downloaded audio (32 MiB per session, least recently
  used eviction), dropped on sign-out and account changes.

Downloads are deduplicated per key. A failed download shows a retry button in the
bubble. Outgoing clips seed the cache once accepted.

## Setup

`ELEVENLABS_API_KEY` is an **optional** Worker secret. Without it, voice replies and
the voice picker stay off (`features.voiceMessages` is false); people can still send
voice messages, which only need `META_API_KEY`. Migration
`0060_voice_messages.sql` adds the columns. See [infrastructure](infrastructure.md).

- Local: add `ELEVENLABS_API_KEY=...` to ignored `apps/api/.dev.vars`.
- Production: add `ELEVENLABS_API_KEY` as an encrypted build variable of the API's
  Workers Builds project (the release copies it to the runtime secret), push, then
  turn on **Contact voice messages** in the admin panel.
- Rollback: the migration is additive. Older clients show contact voice messages as
  text and person voice messages as an empty bubble.

## iOS

The native app (`apps/ios`) implements the same behavior in private chats and groups.

- **Capture.** `VoiceRecorder.swift` records with `AVAudioRecorder` directly as mono
  16-bit PCM WAV at 16 kHz into a temporary directory created with `0700` permissions
  and complete file protection. `takeClip()` reads the finished WAV into memory and
  deletes the directory at once; folders left by a killed app are removed after
  15 minutes on the next launch of a chat. The duration comes from the WAV `fmt `
  and `data` chunks (recorder padding chunks are skipped). Nothing is transcribed
  before sending; the old `/transcriptions` client calls were removed.
- **Permission.** The first press asks for microphone access and records nothing
  (the hint "Hold to record, release to send." follows). A denied permission shows
  "Microphone access is disabled…" under the composer; enable it in Settings.
- **Audio session.** Recording uses the `.record` category and playback `.playback`
  with `.spokenAudio`, so voice messages play with the silent switch on. Each side
  activates the shared session only while it is in use and deactivates it with
  `.notifyOthersOnDeactivation`. Starting a recording stops any playing voice message
  first (`VoicePlayer.isRecording`), and playback never starts while recording.
- **Interruptions.** A system deactivation of the session (call, Siri, another app)
  discards an active recording with "Recording was interrupted. Please record
  again." and pauses playback without resuming it. Unplugging headphones pauses
  playback. Backgrounding the app, leaving the chat or losing access to it discards
  an active recording and stops playback.
- **Composer.** `VoiceComposer.swift` holds `VoiceRecordButton` (one `DragGesture`
  with zero minimum distance: release sends, 100 points left cancels, 80 points up
  locks) and `VoiceRecordingBar` (pulsing red dot, timer, "‹ Slide to cancel" that
  follows the finger, and **Delete** when locked). While locked the microphone
  becomes **Stop**, which stops and sends. A gesture the system cancels counts as a
  release. The 60-second limit stops and sends; clips under 0.5 seconds are discarded
  with the hint. VoiceOver activates the microphone to start a locked recording and
  activates it again to send.
- **Sending.** `ChatStore.send(voice:)` and `GroupChatStore.send(voice:)` show the
  outgoing voice bubble with the clock and play it from memory while pending. A failed
  private send keeps the clip and reply target in the conversation store
  (`failedVoice`) with **Retry** (same UUID until the clip changes) and **Delete**
  above the composer; the microphone stays disabled until one is chosen. Groups keep
  an uncertain send pending with **Retry sending** (same UUID); a clip the server
  rejected moves to the same **Retry**/**Delete** row and retries with a new UUID.
  Conversation stores holding a failed clip are not evicted from the session LRU.
- **Bubbles.** `VoiceMessageView` (`VoiceMessageView.swift`) shows play/pause, a
  progress bar, the elapsed time while playing (the duration otherwise), the send
  time and the usual receipts. Outgoing bubbles add the microphone in
  `MessageReceiptView.readColor` once `voice.listenedAt` is set. `VoicePlayer.shared`
  (`VoicePlayback.swift`) plays one clip at a time with `AVAudioPlayer`; scrolling does
  not stop it. Reply quotes of voice messages read "Voice message".
- **Transcript.** The long-press popover adds **View transcript** (also a VoiceOver
  action), which opens `VoiceTranscriptSheet`; the sheet reads the current message,
  so it updates when polling delivers the transcript.
- **Contact details.** With `features.voiceMessages` from `GET /me` (refreshed when
  contact details open), `ContactEditorView` shows the **Voice** section: the
  participant's **Voice messages** switch and, for the creator (`canManage`), a
  **Voice** row opening a picker with a sample button per voice. Shared participants
  see the voice name read-only.

### iOS caching

- **Audio bytes** (`VoiceAudioCache.swift`): an 8 MiB memory `NSCache` in front of a
  protected disk cache in `Caches/PrivateAudio-v1`, using the same `ProtectedDiskCache`
  actor as private images: complete file protection, excluded from backups, SHA-256
  file names, 64 MiB per account with least recently read eviction and seven-day idle
  expiry. Keys are `contact/<id>/voice/<turnID>/user`,
  `contact/<id>/voice/<turnID>/assistant/<part>`, `group/<id>/voice/<messageID>` and
  `voices/<voiceID>/preview`, all inside the account directory. Concurrent requests
  share one disk read or download; failures are not cached and the bubble shows a
  retry button. Accepted outgoing clips (including uncertain sends confirmed by
  history) seed the cache.
- **Lifecycle.** `PrivateImageCache` owns the audio cache and forwards activation and
  every clear, so sign-out, session expiry, account switches and the access-loss
  clears (contact deletion, contact/history 404, lost group membership) drop audio
  with images. Session epochs reject late downloads after a clear.
- **Metadata** (`voice`, contact voice fields) lives in the existing conversation
  stores and contacts store, so it follows their freshness and invalidation rules.
- **Voice catalog:** `ContactsStore.voiceCatalog` (`NavigationSnapshotCache`) loads
  once per session when the creator opens the picker, deduplicates requests, keeps
  the list through failed refreshes and is dropped with the signed-in shell.
  Pull to refresh reloads it.

### iOS verification

Static type checking only. Not yet verified on a device: the permission prompt,
hold/slide/lock gestures, auto-stop at 60 seconds, interruption by a call while
recording or playing, silent-switch playback, headphone removal, cache reuse after
relaunch and offline, retry after a failed send or download, the transcript sheet
update, account switching, and the contact voice picker samples.

## Web

The web Worker's `Permissions-Policy` header allows the microphone for the app's own
origin (`microphone=(self)` in `apps/web/nuxt.config.ts`). It was `microphone=()`
until October 29, 2026, which made browsers reject recording without asking for
permission, even when the site was allowed manually.

The web app (`apps/web`) implements the same behavior in private chats and groups.

- **Capture.** `useVoiceRecorder.ts` records with `MediaRecorder` (WebM/Opus, Ogg or
  MP4 depending on the browser), then decodes the clip with Web Audio and renders it
  through an `OfflineAudioContext` as mono 16-bit PCM WAV at 16 kHz. The clip is sent
  as base64 in the message body; nothing is transcribed before sending. The duration
  shown in the pending bubble is the rendered WAV length.
- **Composer.** `ChatComposer.vue` shows the microphone while the draft is empty and
  has no attachment. Hold uses pointer events with pointer capture, so mouse, pen and
  touch behave alike: release sends, about 100 px left cancels, about 80 px up locks
  (the lock hint appears above the button while holding). The locked bar shows
  **Delete** and the button becomes **Stop**, which sends. Releasing before the
  microphone is ready (the first press may only show the browser permission prompt)
  records nothing. Space or Enter on the microphone starts a locked recording for
  keyboard and screen reader users. The 60-second limit, the 0.5-second minimum with
  the "Hold to record, release to send." hint, and discarding on a hidden tab or on
  leaving the conversation match the contract. Permission and decoding failures show
  an error under the composer.
- **Sending.** The private and group conversation stores keep the clip and UUID in the
  pending send, show the outgoing voice bubble with the clock, and offer **Retry**
  (same UUID) or **Delete** after a failure. The composer stays disabled while a send
  is pending, as for text.
- **Bubbles.** `VoiceMessage.vue` renders play/pause, a seekable range input and the
  elapsed time or duration; outgoing bubbles add the microphone, grey until
  `voice.listenedAt` and then `--read` (the read-check color). One shared `<audio>`
  element plays at a time; leaving a chat, group or contact page stops it. A failed
  download or playback shows a retry button in the bubble.
- **Transcript.** The message menu (long press, right click or the reaction button)
  adds **View transcript**, which opens a dialog that updates as polling delivers the
  transcript. Reply quotes of person voice messages read "Voice message".
- **Contact details.** With `features.voiceMessages` from `GET /me`, the contact page
  shows the **Voice** section: the participant's **Voice messages** switch and, for
  the creator, an expandable voice list with a sample play button per voice.
  Participants see the voice name read-only.

### Web caching

- **Audio bytes** (`useVoiceAudio.ts`): an in-memory map of object URLs keyed by
  account ID and download path (message IDs are immutable, assistant parts add
  `side` and `part`), bounded to 32 MiB per session with least recently used eviction
  (the clip that is playing is kept). Concurrent requests share one download; failed
  downloads are not cached and retry on the next play. Accepted outgoing clips seed
  the cache, and a pending clip plays from memory under its final path, so playback
  continues when the accepted message replaces the pending bubble. Voice samples use
  the same cache under `voices/:id/preview`. Sign-out, a 401 and account changes
  stop playback, revoke every URL and clear the map. Nothing is written to disk,
  `localStorage` or IndexedDB; the API's `no-store` keeps bytes out of the HTTP cache.
- **Metadata** (`voice`, contact voice fields) lives in the existing conversation
  stores and contacts list, so it follows their freshness and invalidation rules.
- **Voice catalog** (`useVoices.ts`): loaded once per session when the creator opens
  the voice list, deduplicated, reused synchronously afterwards (a failed refresh
  keeps the loaded list) and cleared on session reset. **Retry** reloads it.
- **Features:** `features` from `GET /me` is kept with the session user, refreshed
  when the contact page opens and cleared on session reset.

### Web limitations and verification

Static checks only (`npm run typecheck` in `apps/web`). Not yet verified in a
browser: recording, permission prompts, hold/slide/lock gestures on touch screens,
playback and seeking, and the contact voice picker. `MediaRecorder` formats and
`decodeAudioData` support differ by browser: Chrome is the reference; Safari
(MP4/AAC recording) and Firefox (Ogg/Opus) are unverified. Safari may block playback
that starts after an uncached download (autoplay policy); the bubble then shows its
retry button and the next tap plays from the cache. Browsers without
`MediaRecorder` or `getUserMedia` (or pages served without HTTPS) show no microphone.
