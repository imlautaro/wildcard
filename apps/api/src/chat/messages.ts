import type { Attachment } from './attachments';
import { parseLearningQuestion, type LearningQuestion } from './learning';
import { parsePrivateReply, type ReplyTarget } from '../replies/data';
export type ContactResponse = { messages: string[]; attachment?: Attachment | null; replyTo?: ReplyTarget | null; learningRevision?: number; learningQuestion?: LearningQuestion | null };
export const quoteInstruction = 'Quote an earlier message only when it clarifies which message you are answering: overlapping topics, several unanswered messages, or returning to an older point. Default to no quote when the context is obvious. A shared question such as what everyone ate does not need a quote on each answer. Use actual supplied message IDs, never copied quote text or invented IDs. Quote only once at the start of your response, not on every successive message.';

// A turn may be one cohesive message or a short conversational burst.
export const messageInstruction = 'Choose the number of messages from context, your personality and the current request. One message is often best. When natural, use several successive messages, each a meaningful conversational beat. Never mechanically split sentences, fragment code/lists, repeat greetings or pad the reply. Use 1–8 nonempty messages, at most 20,000 Unicode characters in total. The count is a safety ceiling, not a target. The server delivers them in order with short pauses.';

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
export function messageDelay(text: string) {
  return Math.min(3000, 900 + Array.from(text).length * 20);
}

// Pause between reading a message and starting to type, scaled to its length.
export function readingDelay(text: string) {
  return Math.min(2500, 400 + Array.from(text).length * 10);
}
