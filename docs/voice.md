# Voice dictation

An empty or whitespace-only chat draft shows a microphone instead of the send
arrow. Tap it to request microphone permission and start recording. The circular
button becomes a red stop button; tap again to transcribe. Recording stops
automatically after one minute. A timer and Cancel action remain visible.

The transcript becomes an editable draft. It is not automatically sent to the
contact; tap the send arrow after reviewing it. The normal Muse Spark conversation
flow starts only when that text is sent. This feature is dictation, with no audio
message attachment or playback in history.

## iOS lifecycle

`VoiceRecorder` uses AVAudioApplication permission and AVAudioRecorder to create
mono, signed 16-bit little-endian PCM WAV at 16 kHz. The app's Info.plist includes
`NSMicrophoneUsageDescription`; no speech-recognition permission or Apple Speech
service is used. The app must be updated/reinstalled to include these changes.

Recording and transcription show distinct states and prevent overlapping uploads.
A failed transcription retains its protected temporary file while this screen
remains active, offering Retry transcription or Discard recording. Starting a
new recording discards the previous clip. Denied permission presents an error
explaining how to enable the microphone in Settings. System audio interruptions discard
an active recording. The iOS 27 deactivation notification is filtered by its
deactivation context: app-requested cleanup is ignored, including delayed events
from a previous clip. A recorder only deactivates a session it activated, so
canceling an idle recorder does not interfere with another screen's capture.
Successful completion marks the clip ready before deactivating audio.
Leaving the screen or entering the background cancels work
and removes the temporary file. Permission dialogs becoming inactive do not cancel
permission setup. Successful transcription deletes the clip as well.

Files use a private temporary directory and complete file protection. If the app
is killed before cleanup, recorder initialization removes matching temporary
folders older than 15 minutes. Temporary cleanup is best effort and OS-managed;
it does not guarantee physical secure erasure. Draft text remains in memory
until sent and is not durably saved. Recording/transcription is a foreground
operation; closing the app does not guarantee a transcript. Once text is accepted
as a chat message, the existing [durable reply workflow](chats.md) applies.

## API and provider contract

`POST /api/v1/contacts/:contactID/chat/transcriptions` accepts a raw `audio/wav`
body with the existing bearer session. The contact must belong to the current
user, checked before transcription and again before returning the result. The
response is `{ "text": "The recognized speech." }` with no-store caching.

The API limits uploads to 2 MiB, 0.25–60 seconds of mono PCM16 at 16 kHz, and six
transcription admission attempts per user per minute. It checks RIFF/WAVE chunk
boundaries, format, sample count, and a maximum of 128 chunks, then normalizes the
container to remove metadata before forwarding audio. This route has its own
body limit; text send/retry routes retain their 32 KiB limit.

The Worker sends a multipart request to
`https://api.meta.ai/v1/asr/transcribe` using:

- JSON form field `request`: `model: muse-voice-transcribe-1.0`,
  `audioEncoding: WAV`, `mode: PUSH_TO_TALK`.
- File field `audio` with the normalized WAV recording.
- `Authorization: Bearer <META_API_KEY>` and `Accept: application/json`.

It reads the provider's `transcript` string from a response bounded to 64 KiB,
rejecting empty speech, NUL, and transcripts longer than 4,000 Unicode code points.
Language detection uses the provider default; no translation or language bias is
requested. The model key stays on the Worker. Manual redirect handling prevents
forwarding it to another URL. Provider requests time out after 90 seconds; the
native upload request has a 120-second timeout. No automatic inference retries
run in the API. A manual retry can incur another provider charge, including if a
previous network response was lost after processing.

Status codes: 400 invalid WAV/duration, 401 missing/expired session, 404 inaccessible
contact, 413 oversized upload, 415 unsupported media type, 422 no speech
(`code: NO_SPEECH`) or oversized transcript (`code: TOO_LONG`), 429 admission limit,
503 missing key/provider rejection, and 502 other provider or network failure.
Client errors do not expose provider bodies, credentials, or raw audio.

## Infrastructure, privacy, and reproduction

No additional Cloudflare resource, binding, secret name, or D1 migration is
required. Reuse the existing `META_API_KEY` and ensure its Meta project has access
to Muse Voice Transcribe. See [infrastructure](infrastructure.md) for independent
account setup, encrypted key configuration, and the guarded automatic release.
For local development, place your own key in ignored `apps/api/.dev.vars` and use
the existing local auth setup. Do not use real private audio for demos without a
separate decision; fabricated sample speech is sufficient.

Audio passes through the Worker to Meta for transcription. It is not stored in
D1, R2, Workflow checkpoints, or application logs. The unsent transcript is returned
to iOS only; D1 receives it only when the user sends the draft. Provider retention
and training policies are outside this implementation; this feature does not
choose a new training-data policy. Cancellation cannot recall audio already
received by Meta or prevent a charge for processing already started.

Release only through committed and pushed source and Workers Builds. The route
is additive; older clients remain compatible and code rollback requires no data
rollback. After an authorized release, verify the active commit tag and use a
fictional recording to check permission denial, recording/stop/cancel, silence,
transcription retry, user isolation, background cleanup, and text submission.

Static TypeScript, Swift, Info.plist, and whitespace validation were performed.
No tests, app builds, simulator runs, real microphone capture, paid transcription,
or production release were performed during implementation. Device recording
format, installed UI, and actual model access remain unverified.

For the deactivation handling fix, device verification remains pending in both
private and group chats: record/stop/transcribe, cancel and immediately record
again, navigate back and reopen, and interrupt capture with a call or Siri.
Normal cleanup must not show an interruption error; system interruption must
discard the clip and allow a fresh recording. Temporary-file retention and
no-store transcription behavior are unchanged.

## References

- [Meta speech to text](https://dev.meta.ai/docs/speech-to-text)
- [Transcribe a recording](https://dev.meta.ai/docs/api-reference/voice/transcribe)
- [Apple AVAudioRecorder](https://developer.apple.com/documentation/avfaudio/avaudiorecorder)


## Web

The web composer offers the same dictation in private and group chats, with the same
copy, one-minute limit, Cancel, **Retry transcription** and **Discard recording**.
The browser asks for microphone permission on the first recording. `MediaRecorder`
produces WebM, Ogg or MP4 depending on the browser, so `useVoiceDictation.ts` decodes
the clip with Web Audio and renders it through an `OfflineAudioContext` as mono
16-bit PCM WAV at 16 kHz before uploading it to the same routes. Audio stays in
memory: it is dropped after a successful transcription, on discard, when the page is
left and when the tab is hidden during recording (as backgrounding does on iOS).
The microphone appears only in browsers with `getUserMedia` and `MediaRecorder`.

Verified on October 29, 2026 in headless Chrome: a 1.4-second synthetic recording
(`audio/webm;codecs=opus`) became a 16 kHz mono PCM16 WAV that the API's
`normalizedRecording` accepts. Real microphone capture, Safari and Firefox, and a
paid transcription were not exercised.

## Group dictation

Groups reuse the recorder, limits, provider and editable-transcript interaction.
`POST /api/v1/groups/:id/transcriptions` authenticates a current member, requires
applicable Contributor consent and rechecks access after inference. The six-per-
minute account budget is shared with private dictation. It stores no audio clip;
only the transcript is sent as an ordinary group message after confirmation.
See [groups](groups.md#group-photos-attachments-and-voice).
