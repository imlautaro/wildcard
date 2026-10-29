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
  second are discarded with the hint "Hold to record, release to send." A quick tap
  that releases before the microphone is ready cancels the pending start and shows the
  same hint; both clients enter the "waiting for the microphone" state synchronously on
  press so the release always sees it.
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
current one. Playback continues while scrolling, navigating away and listening in the background.
See [background playback and ear routing](#background-playback-and-ear-routing) for platform limits.

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
`eleven_v4` and `mp3_44100_128` output, matching the provider's
[Text to Speech quickstart](https://elevenlabs.io/docs/eleven-api/quickstart).
Both iOS and web receive the same server-generated audio. The model change applies
only to newly synthesized replies; stored audio and voice previews are not
regenerated. Duration is derived from the constant 128 kbps bitrate.
Real v4 synthesis, account access, voice compatibility and listening quality remain
unverified for this change. Provider failures retain the existing text fallback.

## Casual delivery and speech accent (0061)

New contact replies use `voice_settings: { stability: 0.4, similarity_boost: 0.75 }`
with Eleven v4. The conversation prompt favors spontaneous spoken phrasing, varied
short clauses and context-appropriate tone, preserving the contact's personality
without forced slang, fillers, laughter or stage directions. There is no extra
rewrite inference. The server prefixes a delivery-only
`[casual, conversational delivery]` tag and, when selected, an accent tag.
Brackets in the plain message are removed from the synthesis input so message text
cannot introduce additional provider tags. These directions never enter stored
message text, transcripts, previews, notifications or memory.

**Speech accent** is an optional preference on the shared agent
(`contact_agent.speech_accent`), independent of nationality, identity claims and the
listener's language or country. In contact details on iOS and web, the creator can
choose, in the **Voice** sheet, **Default accent** (stored as no preference) or one of the regional presets in `shared/voice.ts`,
including **Argentine**. Other participants see the selection but cannot change it.
It applies to new private and group replies for everyone. The accent also guides
natural regional phrasing in voice-enabled conversation prompts; Argentine Spanish
uses voseo, without changing the requested language or inventing a nationality.

New individually AI-generated contacts initialize this preference from the bot's
explicit country selection when a matching preset exists. Other countries use
Voice default. Existing contacts, manual contacts and first-circle onboarding
contacts default to null; there is no inference from personality prose, account
country or time zone, and no backfill. Personality regeneration preserves it.
Changing accent preserves the chosen voice ID; it does not select, clone, remix or
create a provider voice. No new provider permissions or resources are needed.

Accent tags are experimental delivery hints, not guaranteed accents or a provider
`nationality` parameter. Their effect depends on the selected voice, language and
phrase. The provider references are [prompting v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v4)
and [v4 voice settings](https://github.com/elevenlabs/skills/blob/main/text-to-speech/references/voice-settings.md).
Listen to actual generated messages to evaluate the result: catalog samples remain
pre-recorded and do not demonstrate these settings. Existing messages and their
immutable cache identities remain unchanged. A synthesis failure still publishes
text; there is no fallback model or additional synthesis attempt.

Verification pending: real v4 acceptance of the combined delivery/accent tags,
per-voice naturalness and accent fidelity, serious/neutral/emotional content,
Spanish voseo and other languages, and creator/member controls on real devices.
No paid sample generation was performed for this change.

## Contact voices

Every contact has a voice (`contact_agent.voice_id`), part of its shared identity: all
participants hear the same voice, and only the creator can change it.

- **AI-generated contacts** get a voice that matches the requested gender and age:
  `young` under 35, `middle_aged` from 35 to 59, `old` from 60. The choice is
  deterministic per contact among matching voices, falling back to the nearest age
  group (old → middle-aged, young → middle-aged), then gender only, then any voice.
  Within that pool, voices labeled conversational, casual or relaxed in their
  description are preferred when available. Existing saved voices are preserved.
  Available age groups depend on the combined default and saved catalog.
- **Other contacts** (manual, onboarding) get a voice the first time one is needed,
  using the gender/age stored at generation when present, otherwise any voice.
- **Contact details** show, when the feature flag is on, a **Voice messages** switch
  (each participant's own opt-in; on by default in the creator's conversation with
  AI-generated contacts, off for other contacts and for people who join a shared
  contact) and a **Voice** row summarizing accent and voice ("Default accent ·
  Automatic voice" when unset). The row opens a sheet with the accent selector and, for
  the creator, the searchable voice list with a sample play button. Shared participants
  see both read-only. Explanations are behind info buttons.

The catalog combines the installation's ElevenLabs default voices and saved
collection using `GET https://api.elevenlabs.io/v2/voices` with `voice_type=default`
and `voice_type=saved`, retaining `gender`, `age`, `accent` and `description` labels.
Both queries follow `has_more` / `next_page_token` with pages of 100. Results are
deduplicated by voice ID (default entry wins) and sorted by name. A shared 20-second
timeout and 100-page limit per query bound loading; malformed or failed pages reject
the refresh rather than cache a partial catalog. An empty saved collection is valid.
The combined result is cached in memory for one hour per Worker isolate, never on
disk. Existing selected voices are preserved; new automatic assignments use the
combined catalog. API routes and picker behavior are the same on iOS and web.

Add marketplace voices to My Voices / a collection in the account or workspace
whose `ELEVENLABS_API_KEY` the installation uses. This makes those voices available
to all authorized Wildcard users of this installation, not just the operator.
Voice Library API use requires an eligible paid ElevenLabs plan; saving a voice
does not guarantee synthesis access or compatibility. See the provider's
[list voices API](https://elevenlabs.io/docs/api-reference/voices/search) and
[Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library).
After collection changes, allow the server cache to expire and reload the client
catalog (explicit refresh on iOS, a new signed-in session on web). Client caches
can otherwise retain the previous list. Live collection loading, pagination,
samples and selection on both clients remain unverified.

## API

All routes use the bearer session and return `no-store` unless noted.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/me` | Returns `features: { voiceMessages: boolean }` next to `user` (flag on **and** key configured) |
| GET | `/api/v1/voices` | `{ voices: [{ id, name, gender, age, accent, description }] }`; 503 when unavailable |
| GET | `/api/v1/voices/:voiceID/preview` | Sample audio (`audio/mpeg`) proxied from ElevenLabs; 404 for unknown voices |
| PUT | `/api/v1/contacts/:id/speech-accent` | `{ "speechAccent": "AR" }` or null; creator only, shared agent preference; returns `{ contact }` |
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
- **Audio session.** Recording uses `.record`; normal playback uses `.playback`
  with `.spokenAudio`, with `.playAndRecord`/`.default` only for receiver output,
  so voice messages play with the silent switch on. Each side
  activates the shared session only while it is in use and deactivates it with
  `.notifyOthersOnDeactivation`. Starting a recording stops any playing voice message
  first (`VoicePlayer.isRecording`), and playback never starts while recording.
- **Interruptions.** A system deactivation of the session (call, Siri, another app)
  discards an active recording with "Recording was interrupted. Please record
  again." and pauses playback without resuming it. Unplugging headphones pauses
  playback. Backgrounding the app or leaving the chat discards an active recording
  while an already loaded voice message continues. Losing access, clearing history
  or changing accounts stops playback and clears the existing caches.
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
  waveform of real audio amplitude in rounded bars, the elapsed time while playing (the duration otherwise), the send
  time and the usual receipts. The play button has no circular background. The sender's
  avatar sits inside the bubble: left for your clips, right for incoming clips,
  including groups and pending sends. Outgoing bubbles add the microphone in
  `MessageReceiptView.readColor` once `voice.listenedAt` is set. `VoicePlayer.shared`
  (`VoicePlayback.swift`) plays one clip at a time with `AVAudioPlayer`; scrolling does
  not stop it. Reply quotes of voice messages read "Voice message".
- **Transcript.** The long-press popover adds **View transcript** (also a VoiceOver
  action), which opens `VoiceTranscriptSheet`; the sheet reads the current message,
  so it updates when polling delivers the transcript.
- **Contact details.** With `features.voiceMessages` from `GET /me` (refreshed when
  contact details open), `ContactEditorView` shows `ContactVoiceRows`: the
  participant's **Voice messages** switch and a **Voice** row whose sheet holds the
  accent `SearchablePicker` and, for the creator (`canManage`), a pushed voice list
  with a sample button per voice. Shared participants see the voice name read-only.

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
- **Bubbles.** `VoiceMessage.vue` renders a plain play/pause button, rounded bars derived from the actual audio over a
  keyboard-accessible seekable range input, sender avatars (yours on the left,
  incoming senders on the right, including groups and pending sends) and the
  elapsed time or duration; outgoing bubbles add the microphone, grey until
  `voice.listenedAt` and then `--read` (the read-check color). One shared `<audio>`
  element plays at a time and messages continue across navigation and hidden tabs,
  subject to browser background restrictions. Catalog samples stop on hiding the
  tab or leaving their picker. A failed
  download or playback shows a retry button in the bubble.
- **Transcript.** The message menu (long press, right click or the reaction button)
  adds **View transcript**, which opens a dialog that updates as polling delivers the
  transcript. Reply quotes of person voice messages read "Voice message".
- **Contact details.** With `features.voiceMessages` from `GET /me`, the contact page
  shows the participant's **Voice messages** switch and a **Voice** row whose
  `AppSheet` holds the accent select and, for the creator, the voice list with a sample
  play button per voice. Participants see the voice name read-only.

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

## Voice bubble presentation and verification

Both clients decode the real WAV/MP3 audio and compute RMS amplitude in 37 equal
time windows, normalize to the clip's loudest window and apply a 0.65 power curve.
Silence stays at the minimum bar height. Bars are 3–22 points/pixels tall and at
most 2.2 wide. The 44-high waveform, play/pause and avatar share one vertical center;
duration and message metadata live below that row. A 12-wide circular thumb sits
over the bars. Its entire 44-high track accepts touch and dragging (also keyboard
on web and VoiceOver on iOS), so the small circle does not limit the hit area.
Seeking while paused stays paused; seeking before the first play selects the
starting position without starting audio. During playback, dragging seeks directly.
The iOS reply-swipe recognizer excludes the slider so scrubbing cannot trigger a reply.

Analysis starts when a bubble enters the viewport, sharing the existing account-owned
audio download/cache with playback. Pending clips use their local bytes. Until audio
loads, or if decoding fails, the bubble shows a neutral minimum-height baseline,
never invented amplitudes; playback/retry remains available independently. Samples
are immutable for each audio identity, require no API/schema change and also work
for existing messages. Reopening uses cached samples synchronously, or derives
them again from cached bytes; it never revalidates immutable audio on every render.

iOS keeps samples in `VoiceAudioCache` (256 KiB cost budget, 512-entry count limit),
shares concurrent analysis per resource and rejects results from cleared sessions.
Decoding runs off the main actor in 8,192-frame buffers, using a protected temporary
file removed on completion/cancellation; files left by interruption are cleaned
after 15 minutes on cache initialization. Derived samples are memory-only and clear
with audio on sign-out, account change, deletion/access loss or corrupt-byte removal.
The original protected audio disk budget/lifetime is unchanged.

Web attaches the decoded samples and in-flight analysis to the existing audio
entry, adds their numeric bytes to its 32 MiB budget and shares its eviction/reset
behavior. Offline Web Audio decoding is serialized to avoid simultaneous PCM
buffers; decoded PCM is released after reduction. No browser persistence is added.
Both analyzers reject input over 8 MiB, more than eight channels or audio longer
than ten minutes (web checks decoded duration). Failures are not retained as sample
results; re-entering the viewport or pressing play retries analysis.

Device/browser verification remains pending: compare incoming, outgoing and pending
clips in private chats and groups, missing/updated photos, light/dark mode, narrow
screens and large text; check playback, pause/resume, retry, web seeking with pointer
and keyboard, receipts, reopening offline, access loss and account switching.
Also compare real silence/speech peaks in WAV and MP3, seek before first play,
seek while paused/playing, drag to both ends and verify the thumb, time and sound
agree, check that scrubbing cannot reply to a message, and check decode/download
failure and memory eviction.

## Playback speed

While a voice message plays, its sender avatar is replaced with a **1x**, **1.5x**
or **2x** button. Each tap cycles 1x → 1.5x → 2x → 1x and changes the current
clip immediately, preserving its playback position. Pausing, stopping or finishing
restores the avatar. Incoming and outgoing private/group bubbles, including local
pending clips, use the same control, with a fixed 44-point/pixel slot and accessible
speed labels. The same shared player rate applies to subsequent voice messages and
catalog samples; changing chats or stopping playback does not reset it.

This is a listening preference per account on the current device/browser, not a
contact identity or server setting. iOS stores one validated numeric rate under
`voicePlaybackRate.v1.<userID>` in UserDefaults; web stores it under the same key in
localStorage. Only 1, 1.5 and 2 are accepted; missing/invalid values use 1x. Switching
accounts or signing out stops playback and clears the in-memory preference; signing
back in restores that account's saved value. The local value intentionally survives
sign-out. It is not synchronized between devices, browsers or live tabs, and is
removed by clearing the app/browser's local storage. If browser storage is blocked,
the preference lasts only for the current session. No message text, audio or
playback position is stored with this setting.

iOS enables AVAudioPlayer rate adjustment before preparing a new player and reapplies
the saved rate when resuming. Web applies HTMLMediaElement.playbackRate before play
and after source metadata loads, with pitch preservation enabled. Waveform progress,
seeking and elapsed/total labels continue using source-audio time. No regenerated
audio, additional download, provider generation, API change or migration is needed.

Pending device/browser checks: repeated speed cycling mid-clip without restart,
next private/group/local clip at the saved rate, pause/resume and seek, finish/error
avatar restoration, screen reopen and app/browser restart, separate accounts,
blocked browser storage, keyboard/VoiceOver, layout and reply-swipe coexistence.
Static checks do not establish audible timing or touch behavior.


## Reply activity indicators

Both clients show Recording... during voice attachment preparation and Typing...
for text preparation. Private/group list second lines temporarily show that
activity instead of message previews and receipts, preserving message order,
timestamps and unread counts. Groups identify each active contact. This reuses the
existing session-owned summaries, foreground polling, deduplication, pagination,
account isolation and cache eviction without extra row requests or disk storage.
See [chat activity](chats.md#reply-activity-indicators) for freshness/failure
behavior and pending device checks, and [migration 0062](infrastructure.md#recording-presence-migration-0062)
for reproducible setup and rollback.

## Lifecycle cleanup

[Chat lifecycle](chat-lifecycle.md) includes human and synthesized voice bytes, pending clips, playback, waveform/object URLs and protected iOS audio caches. Archive keeps voice history. Late synthesis results recheck the source and enqueue invalid objects for retryable cleanup.

## Background playback and ear routing

On iOS, an already loaded private/group voice message (including a local pending
clip) continues across navigation, screen lock and backgrounding. `VoicePlayer`
owns the in-memory `AVAudioPlayer` independently of the bubble, and the app declares
`UIBackgroundModes = audio`. Force-quitting the app, an OS termination or restarting
the phone ends playback; no process or audio is resurrected. Downloads still in
progress are not promised to complete in the background. There is no autoplay of
the next message. Catalog samples remain foreground-only and stop on picker exit.

Messages publish a generic **Voice message** title, source duration, position and
selected speed to Now Playing. System controls support play/pause, stop and seeking;
the sender profile photo is published as artwork at the user's request; sender
names and transcripts remain unpublished. Pausing retains the
loaded clip and position for explicit resume, releases the audio session and sensor,
and never resumes automatically after calls/Siri or headphone removal. Replacing a
clip, recording, finishing, decoding failure, known access loss, history clearing
and session/account invalidation stop the player and clear its system controls.

On an iPhone using only its built-in output, message play/resume includes a
cancellable **300 ms** grace period before sound. It also applies after a download,
not to the download itself. Samples, iPad and external outputs start without that
extra delay. A second tap, recording, invalidation or replacing the clip cancels a
pending start. Asynchronous playback failures restore the retry state and discard
unplayable cached bytes.

Ear routing uses `UIDevice` proximity monitoring only during message playback on
the built-in iPhone route. Orientation notifications prevent arming it while the
phone is flat or its orientation is unknown. A stable near reading for **120 ms**
switches to the top receiver; a stable far reading for **350 ms** returns to the
speaker, reducing chatter and momentary loud bursts. iOS also blanks the display
and suppresses touches while the enabled proximity sensor is covered. The system
sensor detects nearby objects, not an ear; finger/case interference is still
possible and needs physical-device verification.

Receiver output requires `.playAndRecord` with `.default` and no speaker override;
normal output returns to `.playback`/`.spokenAudio`. No audio input is opened or
recorded for listening. Each transition pauses output while changing category,
preserves source position and speed, and resumes only if it was already audible.
Failure pauses/stops safely instead of falling back to loud playback. Headphones,
Bluetooth, USB, AirPlay and car outputs keep system routing: proximity is disabled
and no speaker override steals an accessory route. Removing an output pauses until
explicit play. The sensor and orientation subscription are released on pause,
completion, error, recording and invalidation. A receiver session already in use
may finish its near/far gesture in the background; background speaker playback
cannot arm a new near gesture, avoiding pocket-triggered routing.

Web keeps the existing shared HTML audio element alive across chat navigation and
hidden tabs. Feature-detected Media Session controls offer a generic title and
sender profile artwork,
play/pause, stop, seeking and current source position/rate when supported. Recording
stops playback and blocks new starts until capture releases the microphone. Browsers
control whether locked-screen/background playback survives suspension; closing the
tab/browser ends it. Browser APIs do not offer dependable proximity monitoring or
built-in receiver selection, so web has no ear routing or artificial startup delay.
No new permission or browser output-selection prompt is introduced.

### Cache and verification

The active iOS clip remains in memory, so ongoing playback does not read completely
protected files while locked. Existing account-owned audio caches, protected disk
retention, request sharing and stale-response rejection are unchanged. Web pins the
active object URL against existing LRU eviction. Position, route, proximity and
system metadata are session-only and cleared with the player; only the existing
numeric speed preference persists. No API, migration, new service or background
network refresh is added. Access changes made elsewhere are enforced when the
existing synchronizer learns them; audio already in memory is not reauthorized
continuously while the app is suspended.

Static Swift/web typechecking and plist/diff validation do not establish audible
routing or timing. Physical iPhone checks remain required: incoming/outgoing and
pending clips in private/groups; immediate pause during the grace period; near at
play, near after playback starts, rapid near/far jitter, flat-phone finger cover,
case interference, lower/raise while locked, foreground/background on both routes,
headphones/Bluetooth/AirPlay connect and disconnect, calls/Siri, seek/speed changes
at the ear, completion, download/route failure, recording, navigation/offline replay,
clear/delete/access loss and account switching. Check that the display wakes and
touches recover after every pause/end/error. On iPad verify speaker/accessories
without proximity. In Safari/Chrome/Firefox verify hidden-tab and locked-screen
playback, system controls, autoplay denial/retry and cleanup after tab closure.

### Sender artwork on system playback controls

The playback card now shows the audio sender's profile photo on iOS and supported
web Media Session surfaces. Private incoming clips use the contact avatar; group
incoming clips use that specific user/agent's member avatar rather than the group
photo. Your sent and pending clips use your account avatar. Missing, unavailable
or failed photos show a neutral person avatar. The title remains **Voice message**;
this change publishes the photo to system surfaces (including the lock screen and
compatible accessories), without publishing names or transcripts. It changes the
playback card, not APNs reply notifications.

Artwork uses the existing account-scoped, versioned private image cache and its
permissions, shared loads and retention limits. iOS reuses a decoded 288-pixel avatar
synchronously, or the session player loads it asynchronously without delaying audio.
That load survives bubble navigation, is canceled on stop/replacement and rejects
late results by cancellation, clip identity and the existing cache session epoch.
The player retains only its current artwork in memory; pause retains it for resume.
Web uses the same avatar path/cache as the bubble and pins its current object URL
against the existing 150-entry image LRU until playback stops or is replaced. Stops,
recording, completion, known access loss, history clearing and account resets release
artwork and clear system metadata. No extra private image persistence or service is
added; a generic placeholder stays visible while a photo loads or cannot load.

The user reported on October 29, 2026 that background playback and proximity routing
work well on their device. The new artwork itself still needs device/browser review:
private/group incoming/outgoing and pending clips, senders without photos, cached
and uncached photos, offline/photo failure, immediate lock/navigation, pause/resume,
rapid clip replacement while photos load, web LRU pressure, and clear/delete/access
loss or account changes while an artwork request is in flight. Static typechecking
does not establish the system's rendered artwork or app-icon presentation.
