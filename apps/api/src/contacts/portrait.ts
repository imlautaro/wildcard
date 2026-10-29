import { NonRetryableError } from 'cloudflare:workflows';
import { isRecord } from '../chat/meta';
import { validPhoto } from '../photos/storage';
import type { OnboardingInput } from '../../../../shared/onboarding';

export async function generatePortrait(env: Env, identity: { age?: number; gender?: string; portrait: string; description: string }, input: OnboardingInput): Promise<Uint8Array> {
  const style = { cartoon: 'original 2D cartoon illustration', anime: 'original anime illustration',
    '3d': 'original cinematic 3D animated movie character', realistic: `${identity.age !== undefined && identity.gender ? `${identity.age} years old ${identity.gender} ` : ''}social media natural photo taken with phone` }[input.style];
  const response = await fetch('https://api.meta.ai/v1/images/generations', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(180_000),
    headers: { Authorization: `Bearer ${env.META_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'muse-image-1.0', n: 1, size: '1024x1024', output_format: 'jpeg',
      response_format: 'b64_json', reasoning_strength: 'low',
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
      prompt: input.style === 'realistic'
        ? `${style}. profile picture for social media. Appearance: ${identity.portrait}. Personality cues: ${identity.description}.`
        : `Create one square profile avatar in this style: ${style}. Head and shoulders, centered face, uncluttered background, natural expression, fully clothed, age-appropriate appearance${identity.age !== undefined ? `, ${identity.age} years old` : ''}, no text or watermark. Original fictional identity, never a real person or existing character. Appearance: ${identity.portrait}. Personality cues: ${identity.description}.` }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 429 || response.status >= 500) throw new Error('MODEL_IMAGE_UNAVAILABLE');
    throw new NonRetryableError('MODEL_IMAGE_REJECTED');
  }
  // Bound provider JSON before buffering; never persist image bytes in Workflow state.
  const reader = response.body?.getReader();
  if (!reader) throw new Error('MODEL_IMAGE_EMPTY');
  let json = '', size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 12 * 1024 * 1024) throw new NonRetryableError('MODEL_IMAGE_TOO_LARGE');
      json += decoder.decode(chunk.value, { stream: true });
    }
    json += decoder.decode();
  } finally { await reader.cancel(); }
  const result: unknown = JSON.parse(json);
  if (!isRecord(result) || !Array.isArray(result.data) || result.data.length !== 1
    || !isRecord(result.data[0]) || typeof result.data[0].b64_json !== 'string') throw new Error('MODEL_IMAGE_INVALID');
  const binary = atob(result.data[0].b64_json);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Meta treats size as aspect ratio, so generated images can exceed 1024 pixels.
  if (bytes.length > 8 * 1024 * 1024 || !validPhoto(bytes, 4096)) throw new Error('MODEL_IMAGE_INVALID');
  return bytes;
}
