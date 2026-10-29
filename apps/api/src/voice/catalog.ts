import { readSetting } from '../admin/settings';

// Optional until the installation configures its own ElevenLabs key (docs/voice.md).
export type VoiceEnvironment = Env & { ELEVENLABS_API_KEY?: string };
export type Voice = { id: string; name: string; gender: string | null; age: string | null; accent: string | null; description: string | null; previewURL: string | null };
export type VoiceProfile = { gender: 'male' | 'female'; age: number };

export const elevenLabsKey = (env: Env) => (env as VoiceEnvironment).ELEVENLABS_API_KEY?.trim() || null;

// Contacts speak only when the operator flag is on and the provider is configured.
export async function voiceRepliesAvailable(env: Env) {
  return !!elevenLabsKey(env) && await readSetting(env.DB, 'voice_messages_enabled');
}

const label = (value: unknown) => typeof value === 'string' && value.trim()
  ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : null;

// The catalog is public provider data, so a per-isolate cache is enough.
let cached: { at: number; voices: Voice[] } | null = null;
export async function listVoices(env: Env): Promise<Voice[]> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.voices;
  const key = elevenLabsKey(env);
  if (!key) throw new Error('VOICE_UNAVAILABLE');
  const response = await fetch('https://api.elevenlabs.io/v2/voices?voice_type=default&page_size=100&include_total_count=false', {
    headers: { 'xi-api-key': key, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    console.error(JSON.stringify({ event: 'voice_catalog_rejected', status: response.status }));
    throw new Error('VOICE_UNAVAILABLE');
  }
  const value = await response.json<{ voices?: unknown }>().catch(() => null);
  if (!value || !Array.isArray(value.voices)) throw new Error('VOICE_UNAVAILABLE');
  const voices = value.voices.flatMap((voice: Record<string, unknown>): Voice[] => {
    if (!voice || typeof voice.voice_id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(voice.voice_id)) return [];
    const labels = voice.labels && typeof voice.labels === 'object' ? voice.labels as Record<string, unknown> : {};
    const preview = typeof voice.preview_url === 'string' && voice.preview_url.startsWith('https://') ? voice.preview_url : null;
    return [{ id: voice.voice_id, name: typeof voice.name === 'string' && voice.name.trim() ? voice.name.trim().slice(0, 100) : voice.voice_id,
      gender: label(labels.gender), age: label(labels.age), accent: label(labels.accent),
      description: typeof labels.description === 'string' ? labels.description.slice(0, 200)
        : typeof labels.descriptive === 'string' ? labels.descriptive.slice(0, 200) : null,
      previewURL: preview }];
  }).sort((a: Voice, b: Voice) => a.name.localeCompare(b.name));
  if (!voices.length) throw new Error('VOICE_UNAVAILABLE');
  cached = { at: Date.now(), voices };
  return voices;
}

// Age groups in order of preference: the matching one, then the nearest. The
// default catalog has no old female voice, so older women get middle-aged voices.
const ageBuckets = (age: number) => age < 35 ? ['young', 'middle_aged'] : age < 60 ? ['middle_aged'] : ['old', 'middle_aged'];

// Deterministic per contact: the same seed keeps its voice across retries.
export function pickVoice(voices: Voice[], profile: VoiceProfile | null, seed: string): Voice | null {
  const gendered = profile ? voices.filter(voice => voice.gender === profile.gender) : [];
  const aged = profile ? ageBuckets(profile.age).map(age => gendered.filter(voice => voice.age === age)).find(pool => pool.length) ?? [] : [];
  const pool = aged.length ? aged : gendered.length ? gendered : voices;
  if (!pool.length) return null;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length];
}

// Assign a voice the first time one is needed. Never overwrites a chosen voice.
export async function agentVoice(env: Env, agentID: string): Promise<string | null> {
  const agent = await env.DB.prepare('SELECT voice_id AS voiceID, voice_profile_json AS profile FROM contact_agent WHERE id = ?')
    .bind(agentID).first<{ voiceID: string | null; profile: string | null }>();
  if (!agent) return null;
  if (agent.voiceID) return agent.voiceID;
  const voice = pickVoice(await listVoices(env), agent.profile ? JSON.parse(agent.profile) as VoiceProfile : null, agentID);
  if (!voice) return null;
  await env.DB.prepare('UPDATE contact_agent SET voice_id = ?, voice_name = ? WHERE id = ? AND voice_id IS NULL')
    .bind(voice.id, voice.name, agentID).run();
  const saved = await env.DB.prepare('SELECT voice_id AS voiceID FROM contact_agent WHERE id = ?').bind(agentID).first<{ voiceID: string | null }>();
  return saved?.voiceID ?? null;
}
