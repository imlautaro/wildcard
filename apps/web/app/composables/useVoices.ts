import type { VoiceOption } from '~/utils/types';

// Session cache of the contact voice catalog (docs/voice.md#contact-voices). The
// catalog is the same for every contact, so it loads once per session, renders
// synchronously afterwards, and is dropped on sign-out and account changes.
// Samples play through the voice audio cache (`voices/:id/preview`).
const voices = ref<VoiceOption[] | null>(null);
const error = ref<string | null>(null);
let request: Promise<void> | null = null;
let revision = 0;

registerSessionReset(() => {
  revision += 1;
  voices.value = null;
  error.value = null;
  request = null;
});

function load(force = false): Promise<void> {
  if (request) return request;
  if (voices.value && !force) return Promise.resolve();
  const started = revision;
  request = api<{ voices: VoiceOption[] }>('voices').then((result) => {
    if (started !== revision) return;
    voices.value = result.voices;
    error.value = null;
  }).catch((failure) => {
    if (started !== revision) return;
    // A loaded catalog stays usable through a failed refresh.
    if (!voices.value) error.value = errorMessage(failure);
  }).finally(() => { if (started === revision) request = null; });
  return request;
}

export function voicePreviewPath(id: string) {
  return `voices/${encodeURIComponent(id)}/preview`;
}

export function useVoices() {
  return { voices: readonly(voices), error: readonly(error), load };
}
