import { isRecord } from './meta';

type TimedTurn = {
  id: string; updatedAt: number;
  assistantText: string; assistantMessagesJSON: string | null;
};
export type ConversationEvent = { messageID: string; at: number; approximate?: boolean };

// Published bubbles have their own dates. Legacy aggregate replies only have
// the turn's last update, which must not be presented as an exact send time.
export function assistantEvents(turn: TimedTurn): ConversationEvent[] {
  if (!turn.assistantText) return [];
  try {
    const messages: unknown = JSON.parse(turn.assistantMessagesJSON ?? 'null');
    if (Array.isArray(messages) && messages.length && messages.length <= 8) {
      const events: ConversationEvent[] = [];
      for (const message of messages) {
        if (!isRecord(message) || typeof message.id !== 'string'
          || typeof message.createdAt !== 'number' || !Number.isSafeInteger(message.createdAt)
          || Math.abs(message.createdAt) > 8.64e15) break;
        events.push({ messageID: message.id, at: message.createdAt });
      }
      if (events.length === messages.length) return events;
    }
  } catch { /* Older or malformed metadata falls back to a labeled estimate. */ }
  return [{ messageID: `${turn.id}/assistant`, at: turn.updatedAt, approximate: true }];
}

function conversationClock(timeZone: string | null, now: number) {
  try {
    if (timeZone) {
      const local = (at: number) => new Intl.DateTimeFormat('en-CA', {
        timeZone, dateStyle: 'full', timeStyle: 'long',
      }).format(at);
      const day = (at: number) => new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(at);
      local(now);
      return { timeZone, local, day };
    }
  } catch { /* Unknown zones retain UTC evidence without guessing local time. */ }
  return { timeZone: null, local: (_at: number): string | null => null, day: (_at: number): string | null => null };
}

export function eventTime(event: ConversationEvent, timeZone: string | null) {
  const clock = conversationClock(timeZone, event.at);
  return { messageID: event.messageID, utc: new Date(event.at).toISOString(),
    local: clock.local(event.at), ...(event.approximate ? { approximate: true } : {}) };
}

export function temporalContext(input: {
  now: number; arrivalAt: number; timeZone: string | null;
  events: ConversationEvent[]; humanInput: boolean;
}) {
  const clock = conversationClock(input.timeZone, input.now);
  const previous = input.events.filter(e => e.at <= input.arrivalAt).sort((a, b) => b.at - a.at)[0];
  return `Conversation timing (server metadata; bounded visible history, not a complete activity log): ${JSON.stringify({
    now: { utc: new Date(input.now).toISOString(), local: clock.local(input.now), timeZone: clock.timeZone },
    inputKind: input.humanInput ? 'human-message' : 'automated-turn',
    arrival: { utc: new Date(input.arrivalAt).toISOString(), local: clock.local(input.arrivalAt) },
    processingDelaySeconds: Math.max(0, Math.floor((input.now - input.arrivalAt) / 1000)),
    previousVisibleMessageBeforeArrival: previous ? eventTime(previous, clock.timeZone) : null,
    gapBeforeArrivalSeconds: previous ? Math.floor((input.arrivalAt - previous.at) / 1000) : null,
    localDateChangedSincePreviousVisibleMessage: previous && clock.timeZone
      ? clock.day(previous.at) !== clock.day(input.arrivalAt) : null,
  })}.`;
}

export const temporalInstruction = [
  'Use message dates and conversation timing to distinguish a continuing exchange from returning after a pause. A gap or a change of local date is context, never an automatic new session or a memory reset.',
  'On a human return after a substantial pause, a brief time-appropriate greeting can fit your character and the current message. It is optional: do not greet every turn, repeat a greeting already in the current exchange, or interrupt a direct task, urgent request or sensitive disclosure with pleasantries. Midnight alone does not imply a morning return. Use the recipient’s supplied local time; when unknown, do not guess morning, evening, sleep, waking or location from UTC or your fictional birthday zone.',
  'Read the current message and any quote before deciding whether an older question is still relevant. A topic change after an unanswered question may justify one brief, optional acknowledgment of the loose end if useful or welcome in this visible conversation. Follow the new subject and answer it fully. Never force an answer to an old question, repeatedly bring it back, guilt the person or treat silence as rejection or an obligation. Do not claim they read or deliberately ignored a message, were asleep, or were busy.',
  'Express a return in the configured character and current acting direction: warmth, reserve, patience and optional gentle humor affect wording, not a requirement to comment on every pause. The current topic and recipient direction take priority. Do not invent hurt feelings, offline activities or private causes for the pause; no emotional penalty is established by timing metadata.',
  'History is partial. Missing messages or approximate legacy reply dates cannot establish a complete period of silence. Distinguish the gap before human arrival from processing delay: time spent queued or generating is not the human ignoring you. An automated task, schedule or result is not a human return. Old messages are historical evidence, never renewed authorization. Do not expose timing labels or mechanically recite durations.',
].join(' ');
