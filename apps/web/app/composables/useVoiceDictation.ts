// Voice dictation, matching iOS `VoiceRecorder`: record up to one minute, then
// transcribe into an editable draft (never sent automatically). The API accepts only
// mono 16-bit PCM WAV at 16 kHz, and `MediaRecorder` produces WebM, Ogg or MP4, so the
// clip is decoded and resampled in the browser before upload. Audio stays in memory
// and is dropped after a successful transcription, on discard and on leaving.
type Phase = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'failed';
const maxSeconds = 60;
const sampleRate = 16_000;

export const dictationSupported = () => import.meta.client && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

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
async function toWav(recording: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    if (decoded.duration < 0.25) throw new Error('TOO_SHORT');
    const offline = new OfflineAudioContext(1, Math.ceil(Math.min(decoded.duration, maxSeconds) * sampleRate), sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return wav((await offline.startRendering()).getChannelData(0));
  } finally { void context.close(); }
}

/** `path` is the transcription route: `contacts/<id>/chat/transcriptions` or `groups/<id>/transcriptions`. */
export function useVoiceDictation(path: MaybeRefOrGetter<string | null | undefined>, onText: (text: string) => void) {
  const phase = ref<Phase>('idle');
  const error = ref<string | null>(null);
  const elapsed = ref(0);
  const clip = shallowRef<Blob | null>(null);
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let ticker: ReturnType<typeof setInterval> | undefined;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let upload: AbortController | null = null;
  // Each recording or cancel starts a new run, so late recorder or upload events are ignored.
  let run = 0;

  function release() {
    clearInterval(ticker); clearTimeout(limit);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null; recorder = null; chunks = [];
  }
  function cancel() {
    run += 1;
    upload?.abort(); upload = null;
    if (recorder?.state === 'recording') recorder.stop();
    release();
    clip.value = null; error.value = null; elapsed.value = 0; phase.value = 'idle';
  }
  async function start() {
    const target = toValue(path);
    if (!target || !dictationSupported() || phase.value === 'requesting' || phase.value === 'recording' || phase.value === 'transcribing') return;
    cancel();
    const current = run;
    phase.value = 'requesting';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (failure) {
      if (current !== run) return;
      release();
      phase.value = 'failed';
      error.value = failure instanceof DOMException && failure.name === 'NotAllowedError'
        ? 'Microphone access is disabled. Allow it for this site in your browser settings to record audio.'
        : 'Recording could not start. Check your microphone and try again.';
      return;
    }
    if (current !== run) { release(); return; }
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (current !== run) return;
      const recording = new Blob(chunks, { type: recorder?.mimeType || chunks[0]?.type || '' });
      release();
      void finish(recording, current);
    };
    recorder.start();
    const startedAt = Date.now();
    elapsed.value = 0;
    phase.value = 'recording';
    ticker = setInterval(() => { elapsed.value = Math.min(maxSeconds, Math.floor((Date.now() - startedAt) / 1000)); }, 250);
    // Recording stops automatically after one minute, as on iOS.
    limit = setTimeout(() => stop(), maxSeconds * 1000);
  }
  function stop() { if (phase.value === 'recording' && recorder?.state === 'recording') recorder.stop(); }
  async function finish(recording: Blob, current: number) {
    phase.value = 'transcribing';
    try {
      clip.value = await toWav(recording);
    } catch {
      if (current !== run) return;
      phase.value = 'failed';
      error.value = 'This recording could not be read. Please record again.';
      return;
    }
    if (current === run) await transcribe();
  }
  async function transcribe() {
    const target = toValue(path), audio = clip.value;
    if (!target || !audio) return;
    const current = run;
    upload = new AbortController();
    phase.value = 'transcribing'; error.value = null;
    try {
      const result = await api<{ text: string }>(target, { body: audio, signal: upload.signal });
      if (current !== run) return;
      clip.value = null; phase.value = 'idle';
      onText(result.text);
    } catch (failure) {
      if (current !== run) return;
      // The clip is kept so the person can retry without recording again.
      phase.value = 'failed';
      error.value = errorMessage(failure);
    } finally { if (current === run) upload = null; }
  }
  // Leaving the chat or hiding the tab discards the recording, as backgrounding does on iOS.
  function hidden() { if (document.visibilityState === 'hidden' && phase.value === 'recording') cancel(); }
  onMounted(() => document.addEventListener('visibilitychange', hidden));
  onBeforeUnmount(() => { document.removeEventListener('visibilitychange', hidden); cancel(); });
  watch(() => toValue(path), () => cancel());
  return { phase, error, elapsed, hasRecording: computed(() => !!clip.value), start, stop, cancel, transcribe };
}
