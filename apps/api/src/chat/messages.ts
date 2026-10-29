// A turn may be one cohesive message or a short conversational burst.
export const messageInstruction = 'Choose the number of messages from context, your personality and the current request. One message is often best. When natural, use several successive messages, each a meaningful conversational beat. Never mechanically split sentences, fragment code/lists, repeat greetings or pad the reply. Use 1–8 nonempty messages, at most 20,000 Unicode characters in total. The count is a safety ceiling, not a target. The server delivers them in order with short pauses.';

export function validMessages(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8
    && value.every(text => typeof text === 'string' && text.trim().length > 0)
    && Array.from(value.join('\n\n')).length <= 20_000;
}

export function parseMessages(content: string): string[] {
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error('MODEL_INVALID_RESPONSE'); }
  if (!value || typeof value !== 'object' || !('messages' in value) || Object.keys(value).length !== 1 || !validMessages(value.messages)) {
    throw new Error('MODEL_INVALID_RESPONSE');
  }
  return value.messages.map(text => text.trim());
}

// Deterministic timing survives Workflow replay; no client timers reveal drafts.
export function messageDelay(text: string) {
  return Math.min(4000, 1500 + Array.from(text).length * 25);
}
