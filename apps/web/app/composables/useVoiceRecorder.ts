import type { DraftVoice } from '~/utils/types';

// Voice message capture, matching iOS (docs/voice.md): record up to one minute and
// hand the clip to the composer, which sends it at once. The API accepts only mono
// 16-bit PCM WAV at 16 kHz, and `MediaRecorder` produces WebM, Ogg or MP4, so the
// clip is decoded and resampled in the browser before upload. Audio stays in memory.
type Phase = 'idle' | 'requesting' | 'recording' | 'processing';
const maxSeconds = 60;
const minimumMs = 500;
const sampleRate = 16_000;
export const shortRecordingHint = 'Hold to record, release to send.';

export const voiceRecordingSupported = () => import.meta.client && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function wav(samples: Float32Array): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return new Blob([view.buffer], { type: 'audio/wav' });
}

// Decodes the recorder's container and renders it as one 16 kHz channel.
async function toWav(recording: Blob): Promise<{ blob: Blob; durationMs: number }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const frames = Math.ceil(Math.min(decoded.duration, maxSeconds) * sampleRate);
    const offline = new OfflineAudioContext(1, Math.max(1, frames), sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return { blob: wav((await offline.startRendering()).getChannelData(0)), durationMs: Math.round(frames / sampleRate * 1000) };
  } finally { void context.close(); }
}

/** `onClip` receives each finished recording; the composer sends it immediately. */
export function useVoiceRecorder(onClip: (clip: DraftVoice) => void) {
  const phase = ref<Phase>('idle');
  // A hint (too short) or an error (permission, unreadable audio) below the composer.
  const notice = ref<{ text: string; error: boolean } | null>(null);
  const elapsedMs = ref(0);
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let limit: ReturnType<typeof setTimeout> | undefined;
  // Each recording or cancel starts a new run, so late permission or recorder events are ignored.
  let run = 0;

  function release() {
    clearInterval(ticker); clearTimeout(limit);
    setVoiceCaptureActive(false);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null; recorder = null; chunks = [];
  }
  /** Discards any recording, including one still waiting for microphone permission. */
  function cancel() {
    run += 1;
    if (recorder?.state === 'recording') recorder.stop();
    release();
    elapsedMs.value = 0; phase.value = 'idle';
  }
  async function start() {
    if (!voiceRecordingSupported() || phase.value !== 'idle') return;
    cancel();
    notice.value = null;
    const current = run;
    phase.value = 'requesting';
    setVoiceCaptureActive(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (failure) {
      if (current !== run) return;
      release();
      phase.value = 'idle';
      notice.value = { error: true, text: failure instanceof DOMException && failure.name === 'NotAllowedError'
        ? 'Microphone access is disabled. Allow it for this site in your browser settings to record audio.'
        : 'Recording could not start. Check your microphone and try again.' };
      return;
    }
    // Released before permission was granted (the first press may only show the prompt).
    if (current !== run) { for (const track of stream?.getTracks() ?? []) track.stop(); stream = null; return; }
    const active = new MediaRecorder(stream);
    recorder = active;
    active.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    active.onstop = () => {
      if (current !== run) return;
      const recording = new Blob(chunks, { type: active.mimeType || chunks[0]?.type || '' });
      const duration = Date.now() - startedAt;
      release();
      void finish(recording, duration, current);
    };
    active.start();
    startedAt = Date.now();
    elapsedMs.value = 0;
    phase.value = 'recording';
    ticker = setInterval(() => { elapsedMs.value = Math.min(maxSeconds * 1000, Date.now() - startedAt); }, 200);
    // Recording stops and sends automatically after one minute, as on iOS.
    limit = setTimeout(() => stop(), maxSeconds * 1000);
  }
  /** Stops and sends the recording; clips shorter than half a second are discarded. */
  function stop() {
    if (phase.value === 'recording' && recorder?.state === 'recording') {
      clearInterval(ticker); clearTimeout(limit);
      recorder.stop();
    }
  }
  async function finish(recording: Blob, duration: number, current: number) {
    if (duration < minimumMs) { discardShort(); return; }
    phase.value = 'processing';
    try {
      const { blob, durationMs } = await toWav(recording);
      if (current !== run) return;
      if (durationMs < minimumMs) { discardShort(); return; }
      const data = base64(new Uint8Array(await blob.arrayBuffer()));
      if (current !== run) return;
      phase.value = 'idle'; elapsedMs.value = 0;
      onClip({ blob, durationMs, data });
    } catch {
      if (current !== run) return;
      phase.value = 'idle'; elapsedMs.value = 0;
      notice.value = { error: true, text: 'This recording could not be read. Please record again.' };
    }
  }
  function discardShort() {
    phase.value = 'idle'; elapsedMs.value = 0;
    notice.value = { error: false, text: shortRecordingHint };
  }
  // Hiding the tab discards the recording, as backgrounding does on iOS.
  function hidden() { if (document.visibilityState === 'hidden' && phase.value !== 'idle') cancel(); }
  onMounted(() => document.addEventListener('visibilitychange', hidden));
  onBeforeUnmount(() => { document.removeEventListener('visibilitychange', hidden); cancel(); });
  return { phase, notice, elapsedMs, start, stop, cancel };
}
