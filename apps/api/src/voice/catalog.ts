import { speechAccent } from '../../../../shared/voice';
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

// Installation-wide provider metadata; never persist the account's collection.
let cached: { at: number; voices: Voice[] } | null = null;

async function voicePages(key: string, type: 'default' | 'saved', signal: AbortSignal): Promise<unknown[]> {
  const voices: unknown[] = [];
  const tokens = new Set<string>();
  let token: string | null = null;
  // Bound provider calls and memory; never cache a truncated catalog.
  for (let page = 0; page < 100; page += 1) {
    const url = new URL('https://api.elevenlabs.io/v2/voices');
    url.searchParams.set('voice_type', type);
    url.searchParams.set('page_size', '100');
    url.searchParams.set('include_total_count', 'false');
    if (token) url.searchParams.set('next_page_token', token);
    const response = await fetch(url, {
      headers: { 'xi-api-key': key, Accept: 'application/json' }, redirect: 'manual', signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.error(JSON.stringify({ event: 'voice_catalog_rejected', status: response.status }));
      throw new Error('VOICE_UNAVAILABLE');
    }
    const value = await response.json<{ voices?: unknown; has_more?: unknown; next_page_token?: unknown }>().catch(() => null);
    if (!value || !Array.isArray(value.voices) || typeof value.has_more !== 'boolean') throw new Error('VOICE_UNAVAILABLE');
    voices.push(...value.voices);
    if (!value.has_more) return voices;
    if (typeof value.next_page_token !== 'string' || !value.next_page_token || tokens.has(value.next_page_token)) {
      throw new Error('VOICE_UNAVAILABLE');
    }
    token = value.next_page_token;
    tokens.add(token);
  }
  throw new Error('VOICE_UNAVAILABLE');
}

export async function listVoices(env: Env): Promise<Voice[]> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.voices;
  const key = elevenLabsKey(env);
  if (!key) throw new Error('VOICE_UNAVAILABLE');
  const signal = AbortSignal.timeout(20_000);
  const catalogs = await Promise.all([voicePages(key, 'default', signal), voicePages(key, 'saved', signal)]);
  const seen = new Set<string>();
  const voices = catalogs.flat().flatMap((value): Voice[] => {
    if (!value || typeof value !== 'object') return [];
    const voice = value as Record<string, unknown>;
    if (!voice || typeof voice.voice_id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(voice.voice_id)) return [];
    if (seen.has(voice.voice_id)) return [];
    seen.add(voice.voice_id);
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

// Age groups in order of preference: the matching one, then the nearest.
// Available voices can vary as the installation changes its saved collection.
const ageBuckets = (age: number) => age < 35 ? ['young', 'middle_aged'] : age < 60 ? ['middle_aged'] : ['old', 'middle_aged'];

// Deterministic per contact: the same seed keeps its voice across retries.
export function pickVoice(voices: Voice[], profile: VoiceProfile | null, seed: string): Voice | null {
  const gendered = profile ? voices.filter(voice => voice.gender === profile.gender) : [];
  const aged = profile ? ageBuckets(profile.age).map(age => gendered.filter(voice => voice.age === age)).find(pool => pool.length) ?? [] : [];
  const matching = aged.length ? aged : gendered.length ? gendered : voices;
  // Favor a conversational source delivery without changing existing saved voices.
  const conversational = matching.filter(voice => /\b(conversational|casual|relaxed)\b/i.test(voice.description ?? ''));
  const pool = conversational.length ? conversational : matching;
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

// Tell the model the truth about voice, so it never denies sending audio while the
// app speaks its reply. `optedIn` is the conversation's voice-message opt-in.
export async function voiceInstruction(env: Env, optedIn: boolean, agentID: string): Promise<string> {
  if (!await voiceRepliesAvailable(env)) return '';
  const preference = optedIn ? await env.DB.prepare('SELECT speech_accent AS accent FROM contact_agent WHERE id = ?')
    .bind(agentID).first<{ accent: string | null }>() : null;
  const accent = speechAccent(preference?.accent);
  const direction = accent ? ` Speech accent preference: ${accent.name}.${accent.code === 'AR' ? ' When speaking Spanish, use natural Argentine voseo.' : ''} When appropriate to the language being spoken, use matching everyday phrasing and forms of address. This is a speech preference, not evidence of nationality, background or personality. Do not force slang, caricatures or a language change.` : '';
  return optedIn
    ? 'Voice messages are on: the app automatically delivers one message per reply as a voice note in your own voice when it is plain conversational prose of 60–600 characters (no links, lists, code, tables or headings). You can send voice notes; never say you cannot send audio. When someone asks for a voice message or audio, write that message as natural spoken prose within that length, without emojis or formatting. Shorter or longer messages arrive as text. Never pad a brief acknowledgement or a complete short answer just to reach the voice-note length; text is fine. For voice-suitable replies, write like a spontaneous voice note to the current audience: conversational phrasing, short clauses, contractions where natural, and varied sentence lengths. Keep your personality and the context, including serious topics; avoid announcer introductions, polished narration and theatrical emphasis. Do not add habitual fillers, laughter, sighs or invented hesitations. Use ordinary punctuation and never write audio tags or stage directions.' + direction
    : 'Voice messages are off in this conversation, so you cannot send audio here. If someone asks for one, say they can turn on Voice messages in your contact details.';
}
