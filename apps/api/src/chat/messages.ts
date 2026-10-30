import type { Attachment } from './attachments';
import { parseLearningQuestion, type LearningQuestion } from './learning';
import { parsePrivateReply, type ReplyTarget } from '../replies/data';
export type ContactResponse = { messages: string[]; attachment?: Attachment | null; replyTo?: ReplyTarget | null; learningRevision?: number; learningQuestion?: LearningQuestion | null };
export const quoteInstruction = 'Quote an earlier message only when it clarifies which message you are answering: overlapping topics, several unanswered messages, or returning to an older point. Default to no quote when the context is obvious. A shared question such as what everyone ate does not need a quote on each answer. Use actual supplied message IDs, never copied quote text or invented IDs. Quote only once at the start of your response, not on every successive message.';

// A turn may be one cohesive message or a short conversational burst.
export const messageInstruction = 'Choose the number of messages from context, your personality and the current request. One message is often best, especially for a short answer or an ordinary group contribution. When a longer answer is actually needed, consider a few successive messages if distinct ideas or stages would be easier to read separately. Each must be a meaningful, self-contained conversational beat; do not make readers wait for a missing qualifier or essential caution. Keep a cohesive explanation, code block, list or requested document together. Never mechanically split by sentence or character count, repeat greetings, add a question per part or pad the reply to create a burst. Splitting is an occasional readability choice, not a reason to say more or a substitute for concise writing. Use 1–8 nonempty messages, at most 20,000 Unicode characters in total. The count is a safety ceiling, not a target. The server handles length-aware typing and delivery pauses before every message; never narrate them.';

export function validMessages(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8
    && value.every(text => typeof text === 'string' && text.trim().length > 0)
    && Array.from(value.join('\n\n')).length <= 20_000;
}

export function parseMessages(content: string): ContactResponse {
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error('MODEL_INVALID_RESPONSE'); }
  if (!value || typeof value !== 'object' || !('messages' in value) || Object.keys(value).some(key => !['messages', 'replyTo', 'learningQuestion'].includes(key)) || !validMessages(value.messages)) {
    throw new Error('MODEL_INVALID_RESPONSE');
  }
  const target = 'replyTo' in value && value.replyTo !== null ? parsePrivateReply(value.replyTo) : undefined;
  if (target === null) throw new Error('MODEL_INVALID_RESPONSE');
  return { messages: value.messages.map(text => text.trim()), replyTo: target ?? null,
    learningQuestion: parseLearningQuestion('learningQuestion' in value ? value.learningQuestion : null, value.messages) };
}

// Deterministic timing survives Workflow replay; no client timers reveal drafts.
export function messageDelay(text: string, seed = '') {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  // A small, replay-stable variation avoids one mechanical speed for every turn.
  const charactersPerSecond = 8 + (hash >>> 0) % 5;
  const length = Array.from(text.trim()).length;
  const paragraphs = (text.match(/\n\s*\n/gu) ?? []).length;
  return Math.min(60_000, Math.round(1100 + length * 1000 / charactersPerSecond + Math.min(paragraphs, 4) * 450));
}

// Voice preparation keeps its own short lead-in rather than a text typing budget.
export function recordingDelay(text: string) {
  return Math.min(3000, 900 + Array.from(text).length * 20);
}

// Pause between reading a message and starting to type, scaled to its length.
export function readingDelay(text: string) {
  return Math.min(2500, 400 + Array.from(text).length * 10);
}
