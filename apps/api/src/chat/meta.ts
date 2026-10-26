import { NonRetryableError } from 'cloudflare:workflows';

export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function museReply(key: string | undefined, messages: ModelMessage[], configuredModel?: string): Promise<string> {
  if (!key?.trim()) throw new NonRetryableError('MODEL_NOT_CONFIGURED');
  const model = configuredModel ?? 'muse-spark-1.3';
  if (model !== 'muse-spark-1.3' && model !== 'muse-spark-1.3-contributor') {
    throw new NonRetryableError('MODEL_NOT_CONFIGURED');
  }
  const response = await fetch('https://api.meta.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: 4096, reasoning_effort: 'low', stream: false }),
    signal: AbortSignal.timeout(120_000),
    // Workers supports manual redirects; never forward the provider credential.
    redirect: 'manual',
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 429 || response.status >= 500) throw new Error('MODEL_TEMPORARILY_UNAVAILABLE');
    throw new NonRetryableError('MODEL_REQUEST_REJECTED');
  }
  if (!response.body) throw new Error('MODEL_EMPTY_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let json = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 256 * 1024) throw new NonRetryableError('MODEL_RESPONSE_TOO_LARGE');
      json += decoder.decode(chunk.value, { stream: true });
    }
    json += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error('MODEL_INVALID_JSON'); }
  if (!value || typeof value !== 'object' || !('choices' in value) || !Array.isArray(value.choices)) throw new Error('MODEL_INVALID_RESPONSE');
  const choice: unknown = value.choices[0];
  if (!choice || typeof choice !== 'object' || !('message' in choice)) throw new Error('MODEL_EMPTY_RESPONSE');
  const message = choice.message;
  if (!message || typeof message !== 'object' || !('content' in message) || typeof message.content !== 'string' || !message.content.trim()) {
    throw new Error('MODEL_EMPTY_RESPONSE');
  }
  const text = message.content.trim();
  if (Array.from(text).length > 20_000) throw new NonRetryableError('MODEL_RESPONSE_TOO_LARGE');
  return text;
}
