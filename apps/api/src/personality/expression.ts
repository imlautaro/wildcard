import type { Personality } from '../../../../shared/personality';

// Emoji and reaction habits. People differ: some put an emoji in almost every
// message, others almost never, and most react to a message only now and then.
// A fixed instruction ("use emoji naturally") makes a model either never use them or
// use them everywhere, so each turn gets one concrete, seeded nudge instead:
// - a personal rate, from the Emoji trait (or a stable per-contact value when the
//   personality is off), shifted a little toward how the other people write;
// - a correction toward that rate from what the contact actually did in its recent
//   messages, so it neither drifts into an emoji in every line nor forgets them;
// - a draw seeded by the turn, so a replayed step gets the same nudge;
// - a small personal palette, so a contact has recognizable favorites.
// The model still decides: the nudge never overrides the moment (no emoji in sad,
// tense or serious messages, and only reactions that fit).

export type ExpressionInput = {
  agentID: string;
  personality: Personality;
  // Seeds the draw: the turn or reply ID, so a retry of the same step agrees.
  seed: string;
  // Recent messages by this contact and by the other people, newest first.
  own: string[];
  others: string[];
  // Present when react_to_message is available: recent messages from others
  // (reaction opportunities) and how many of them this contact reacted to.
  reactions?: { opportunities: number; reacted: number; to: string };
};

const emojiPattern = /\p{Extended_Pictographic}/u;
export const hasEmoji = (text: string | null | undefined) => !!text && emojiPattern.test(text);

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const draw = (seed: string) => hash(seed) / 4294967296;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const share = (texts: string[]) => texts.length ? texts.filter(hasEmoji).length / texts.length : null;

// Chance that a message carries an emoji, by level 1–10.
const emojiRates = [0.02, 0.05, 0.1, 0.17, 0.25, 0.35, 0.47, 0.6, 0.72, 0.85];

// Without a configured personality, each contact still gets its own stable habit (3–8).
export function emojiLevel(agentID: string, personality: Personality): number {
  return personality.enabled ? personality.traits.emoji : 3 + hash(`${agentID}:emoji`) % 6;
}

const palettes = {
  warm: ['😊', '🥰', '❤️', '🤗'],
  playful: ['😂', '😅', '🤣', '😜'],
  wry: ['🙃', '😏', '🤭', '👀'],
  bright: ['✨', '🙌', '🎉', '🔥'],
  calm: ['🙂', '👌', '👍', '🤔'],
};
function palette(agentID: string, p: Personality): string[] {
  const t = p.enabled ? p.traits : null;
  const scores: [keyof typeof palettes, number][] = [
    ['warm', t ? t.warmth : 0], ['playful', t ? t.playfulness : 0], ['wry', t ? t.sarcasm : 0],
    ['bright', t ? (t.optimism + t.energy) / 2 : 0], ['calm', t ? 11 - t.energy : 0],
  ];
  // Ties (and contacts without a personality) are broken per contact, so favorites differ.
  const ranked = scores.map(([name, score]) => ({ name, score: score + draw(`${agentID}:${name}`) })).sort((a, b) => b.score - a.score);
  const pick = (name: keyof typeof palettes, count: number) => {
    const items = palettes[name], start = hash(`${agentID}:${name}:start`) % items.length;
    return Array.from({ length: count }, (_, i) => items[(start + i) % items.length]!);
  };
  return [...pick(ranked[0]!.name, 3), ...pick(ranked[1]!.name, 1)];
}

export function expressionHabits(input: ExpressionInput): string {
  const level = emojiLevel(input.agentID, input.personality);
  const own = input.own.slice(0, 8), others = input.others.slice(0, 8);
  // People drift toward the style of whoever they talk to, but only a little.
  const mirror = share(others);
  const target = clamp(emojiRates[level - 1]! + (mirror === null ? 0 : (mirror - 0.3) * 0.25), 0.01, 0.95);
  const recent = own.length >= 3 ? share(own)! : null;
  const chance = clamp(recent === null ? target : target + (target - recent) * 0.8, 0.01, 0.97);
  const roll = draw(`${input.seed}:emoji`);
  const favorites = palette(input.agentID, input.personality).join(' ');
  const habit = level <= 2 ? 'You almost never use emoji; plain words are your style.'
    : level <= 4 ? 'You use emoji now and then, not in most messages.'
    : level <= 7 ? 'You use emoji fairly often, but plenty of your messages have none.'
    : 'You love emoji and use them in most casual messages.';
  const now = roll >= chance ? 'For this reply, write without emoji.'
    : level >= 8 && roll < chance * 0.35 ? `For this reply, an emoji or two fits your style if the moment is casual or warm (your favorites: ${favorites}; others are fine when they fit better).`
    : `For this reply, one emoji fits your style if the moment is casual or warm (your favorites: ${favorites}; others are fine when they fit better).`;
  const parts = [`Emoji habit: ${habit} ${now} Place it where a person would (usually at the end of a sentence), never in sad, tense or serious moments, and not in factual or technical answers.`];
  if (input.reactions) {
    const { opportunities, reacted, to } = input.reactions;
    const reactLevel = input.personality.enabled
      ? (input.personality.traits.expressiveness + input.personality.traits.warmth + input.personality.traits.emoji) / 3
      : 3 + hash(`${input.agentID}:reactions`) % 5;
    const reactTarget = clamp(0.05 + (reactLevel - 1) * 0.05, 0.05, 0.5);
    const reactRecent = opportunities >= 3 ? reacted / opportunities : null;
    const reactChance = clamp(reactRecent === null ? reactTarget : reactTarget + (reactTarget - reactRecent) * 0.8, 0.02, 0.8);
    parts.push(draw(`${input.seed}:reaction`) < reactChance
      ? `Reactions: if ${to} latest message invites one (good news, a joke, thanks, a photo, something touching or exciting), react to it with react_to_message, choosing the emoji that genuinely fits. A reaction can accompany your reply; for a simple acknowledgement it can replace it.`
      : 'Reactions: skip reacting this turn unless a message really calls for one.');
  }
  parts.push('These are habits, not rules: follow the moment first and never mention them.');
  return parts.join(' ');
}

// Sticker habits (docs/stickers.md#habits). Same design as the emoji nudge: a personal rate from
// the Stickers trait, corrected by how often the contact used stickers lately and mirrored a little
// to the person, drawn with the turn ID as seed. A sticker from the person is a different case:
// the usual answer is a sticker back, unless the contact's own sticker came just before.
const stickerRates = [0.005, 0.02, 0.04, 0.07, 0.1, 0.14, 0.19, 0.25, 0.32, 0.4];

// Without a configured personality each contact still gets its own stable level (2–7).
export function stickerLevel(agentID: string, personality: Personality): number {
  return personality.enabled ? personality.traits.stickers : 2 + hash(`${agentID}:stickers`) % 6;
}

export type StickerHabitInput = {
  agentID: string; personality: Personality; seed: string;
  // The person's current message is a sticker.
  answering: boolean;
  // The contact's previous message was a sticker and the person answered it with a sticker.
  blocked: boolean;
  // How many of the contact's last eight replies contained a sticker, out of how many replies.
  ownStickers: number; ownReplies: number;
  // The person's own sticker use over their last eight messages.
  theirStickers: number; theirMessages: number;
};
export function stickerHabits(input: StickerHabitInput): string {
  const level = stickerLevel(input.agentID, input.personality);
  const roll = draw(`${input.seed}:sticker`);
  if (input.blocked) return 'Sticker habit: the person answered your sticker with a sticker, so that exchange is complete. Do not send a sticker for this reply.';
  if (input.answering) {
    const chance = clamp(0.5 + level * 0.045, 0.5, 0.95);
    return roll < chance
      ? 'Sticker habit: the person just sent you a sticker. People usually answer a sticker with a sticker when the moment is light or friendly, so send one back with send_sticker if one of yours fits the mood (a short text with it is fine). If none fits, a reaction or a few words is also natural. Never answer a sad, tense or serious message with a sticker.'
      : 'Sticker habit: the person just sent you a sticker, but this time answer in words or a reaction rather than a sticker.';
  }
  const mirror = input.theirMessages >= 3 ? input.theirStickers / input.theirMessages : null;
  const target = clamp(stickerRates[level - 1]! + (mirror === null ? 0 : mirror * 0.2), 0.003, 0.6);
  const recent = input.ownReplies >= 3 ? input.ownStickers / input.ownReplies : null;
  const chance = clamp(recent === null ? target : target + (target - recent) * 0.8, 0.002, 0.7);
  const habit = level <= 2 ? 'You almost never send stickers.' : level <= 5 ? 'You send a sticker now and then.' : level <= 8 ? 'You like sending stickers and use them fairly often.' : 'You love stickers and send them often.';
  return `Sticker habit: ${habit} ${roll < chance ? 'For this reply a sticker fits your style if the moment is casual, warm or playful and one of yours genuinely matches (send_sticker). Never in sad, tense, serious or technical moments.' : 'For this reply, do not send a sticker.'}`;
}
