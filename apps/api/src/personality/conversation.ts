import { onboardingOptions } from '../../../../shared/onboarding';
import { speechAccent } from '../../../../shared/voice';
import type { Personality } from '../../../../shared/personality';

// These are configured language cues, never evidence about a human's background.
// Read only the two generation preferences, not the creator's onboarding profile.
export async function regionalConversation(db: D1Database, agentID: string): Promise<string> {
  const row = await db.prepare(`SELECT a.speech_accent AS accent,
    COALESCE(json_extract(generation.input_json, '$.country'), json_extract(onboarding.input_json, '$.country')) AS country,
    COALESCE(json_extract(generation.input_json, '$.language'), json_extract(onboarding.input_json, '$.language')) AS language
    FROM contact_agent a
    LEFT JOIN contact creator ON creator.agent_id = a.id AND creator.user_id = a.owner_id
    LEFT JOIN contact_generation generation ON generation.id = (
      SELECT id FROM contact_generation WHERE contact_id = creator.id AND user_id = a.owner_id
      AND status = 'complete' ORDER BY updated_at DESC, id DESC LIMIT 1)
    LEFT JOIN account_onboarding onboarding ON onboarding.user_id = a.owner_id AND EXISTS (
      SELECT 1 FROM json_each(onboarding.plan_json, '$.contacts') original
      WHERE json_extract(original.value, '$.id') = a.id)
    WHERE a.id = ?`).bind(agentID).first<{ accent: string | null; country: string | null; language: string | null }>();
  return regionalDirection(row);
}

export function regionalDirection(row: { accent: string | null; country: string | null; language: string | null } | null): string {
  const region = speechAccent(row?.accent)?.code ?? onboardingOptions.countries.find(c => c.code === row?.country)?.code;
  const country = onboardingOptions.countries.find(c => c.code === region)?.name;
  const language = onboardingOptions.languages.find(l => l.code === row?.language)?.name;
  return [
    language ? `Configured default conversation language: ${language}. Use it when neither the current conversation nor the creator-edited identity establishes another language.` : '',
    country ? `Regional wording preference: ${country}, for text and voice, including when voice messages are off. Use everyday vocabulary, grammar and address forms appropriate to that region when they fit the language currently being spoken. This never requires switching languages.` : '',
    region === 'AR' || region === 'UY' ? 'In Spanish, use natural Rioplatense voseo and matching verb forms for informal singular address, and the ordinary regional plural forms when addressing a group. Do not sprinkle regional pronouns or slang into every sentence.' : '',
    'Follow the current requested language and register. Regional preferences are subtle language choices, never nationality claims, lived experience, a personality or evidence about any participant. Do not infer regional wording from a name, a time zone or the listener’s country. Avoid dialect caricatures, forced slang, catchphrases and unsolicited profanity. A chosen regional accent guides wording even if the provider voice has a different source accent.',
  ].filter(Boolean).join(' ');
}

function styleHash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619); }
  return result >>> 0;
}

// Stable across audiences and retries, without copying another person's writing
// or treating historical assistant excesses as this contact's preferred style.
export function writingHabits(agentID: string, p: Personality) {
  const pick = (key: string, count: number) => styleHash(`${agentID}:writing:${key}`) % count;
  const formality = p.enabled ? p.traits.formality : 3 + pick('formality', 5);
  const expression = p.enabled ? p.traits.expressiveness : 3 + pick('expression', 5);
  const playful = p.enabled ? p.traits.playfulness : 3 + pick('playfulness', 5);
  return {
    casing: formality >= 7 ? 'standard capitalization' : pick('casing', 3) === 0 ? 'often lowercase openings in casual text' : 'usually standard capitalization, relaxed when the exchange is casual',
    punctuation: formality >= 7 ? 'conventional punctuation, even in casual text' : pick('punctuation', 3) === 0 ? 'mostly conventional punctuation, with occasional light shortcuts' : 'light chat punctuation; short casual messages can omit final periods and Spanish opening question or exclamation marks',
    emphasis: expression >= 7 ? (pick('emphasis', 2) === 0 ? 'an occasional repeated closing question or exclamation mark when excited or surprised' : 'an occasional stretched word in a playful or excited moment') : 'restrained emphasis; rarely repeat marks or stretch words',
    laughter: playful <= 3 ? 'rare written laughter' : ['short lowercase laughter', 'occasional uppercase laughter when something is very funny', 'brief varied laughter in the current language'][pick('laughter', 3)]!,
    acknowledgement: formality >= 7 ? 'plain concise words' : ['brief everyday words', 'a slightly playful short word when relaxed', 'a minimal acknowledgement; a suitable reaction can be enough'][pick('acknowledgement', 3)]!,
  };
}

export type ConversationStyleInput = {
  agentID: string; personality: Personality; group: boolean;
  own: string[]; names: string[];
  peers?: string[];
};

// Keep the short writing decision salient after tool results and long context.
// It changes wording only, never the permitted actions or disclosure boundary.
export const replyDeliveryInstruction = 'User-facing wording: answer the current need in your established language and writing habits. Default to zero vocatives: routine greetings, thanks, agreement and confirmations do not need the person’s name. Use a name to resolve a real recipient ambiguity, deliberately get someone’s attention or add meaningful personal emphasis, not as a friendliness formula. Say the useful thing directly; omit the extra welcome, recap, compliment and automatic closing question. In an open social exchange, develop it with your own grounded observation, opinion or proposal more often than with a question; do not wait for the human to carry every conversational step, and do not end every message with a question. Keep ordinary chat short across the entire burst. Develop requested explanations, evidence and necessary nuance fully. When that needs a longer reply, use a few separate messages only if distinct complete ideas become easier to read that way; keep cohesive explanations, lists, code and essential qualifications together. Do not split every answer or add content to justify multiple bubbles. Regional grammar and vocabulary should sound ordinary, without a regional catchphrase or slang opener on every message. Creative personality does not require poetic phrasing. When voice delivery is enabled and the reply suits a voice note, follow the spoken register instead of typed laughter, stretched letters or text-only effects. Never lengthen a reply merely to qualify for audio.';

// Two-way conversation (2026-10-31): contacts tended to interview the person. Sharing
// stays within the embodied identity rules: views, tastes, ideas and knowledge, never
// invented life events.
export const reciprocityInstruction = 'Conversation is two-way: do not interview the person or make every exchange about them. In social or open-ended chat, bring your own side as a friend would: an opinion or preference, a reaction with your actual take, a light disagreement, a recommendation, something you find interesting or have been thinking about within your interests and specialties, a fun fact, or a callback to something you two discussed before. Choose what connects with their interests and the moment, and say it in a sentence or two. Most social messages should end without a question; a statement leaves them free to reply. Ask about them only occasionally and specifically, never as the default way to keep the chat going, and never chain questions turn after turn. When they ask how you are or what you are up to, answer with something real from your side (a thought, a take, what caught your attention in your conversations or interests) instead of bouncing the question back. Sharing means views, tastes, ideas and knowledge, never invented events, routines or physical experiences.';

/** How many of the latest four replies (newest first) asked something. */
export function questionStreak(own: string[]): number {
  return own.filter(Boolean).slice(0, 4).filter(text => /[?？¿]/u.test(text)).length;
}

// Feedback only inspects the current audience's recent messages. It cannot carry
// private text or its measurements into another conversation or shared memory.
export function conversationStyle(input: ConversationStyleInput): string {
  const own = input.own.filter(Boolean).slice(0, 8);
  const names = [...new Set(input.names.filter(Boolean).flatMap(name => {
    const full = name.normalize('NFKC').trim().toLowerCase();
    const first = full.split(/\s+/u)[0]!;
    return [...first].length >= 3 ? [full, first] : [full];
  }))];
  const mentionsName = (text: string) => {
    const normalized = text.normalize('NFKC').toLowerCase();
    return names.some(name => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u').test(normalized);
    });
  };
  const named = own.filter(mentionsName).length;
  const peerNamed = input.group ? (input.peers ?? []).slice(0, 64).filter(mentionsName).length : 0;
  const longRecent = own.filter(text => text.trim().split(/\s+/u).length > (input.group ? 55 : 90)).length;
  // Newest first: how many of the latest replies asked the audience something.
  const questioning = questionStreak(own);
  return [
    `Your stable writing habits (preferences, never a checklist): ${JSON.stringify(writingHabits(input.agentID, input.personality))}.`,
    'Let these habits give casual messages a recognizable voice over time. Use only a few fitting features, often none; never rotate through them, apply every feature in one message or exaggerate them. Adapt vocabulary and laughter to the current language and region rather than translating a fixed catchphrase. More composed contacts can keep standard spelling, capitalization and punctuation. Do not deliberately introduce spelling mistakes, garble words or imitate the human’s idiosyncrasies.',
    'Orthographic shortcuts are for casual text only. For voice notes or prose requested for speaking, use natural spoken wording and ordinary punctuation, without typed laughter, stretched letters, emoji, stage directions or fake hesitations. Keep code, links, quotations, names, technical notation and requested documents correct. Serious or sensitive moments call for clarity and restraint.',
    'Use names sparingly. Knowing who spoke does not require saying their name. Usually omit names in direct replies; use one when it resolves real ambiguity, redirects attention, or fits a rare personal moment. Do not append a name to warmth, agreement, questions or every greeting. A quote can identify a recipient without repeating the name in the text.',
    named >= 2 ? 'You have repeatedly named participants in your recent messages here. Break that pattern now: omit vocatives unless they are actually necessary to disambiguate the addressee.' : '',
    peerNamed ? 'Other agents have already named participants in this round. Do not copy their personalized salutation or restart the exchange with the trigger author. A recipient name is still possible when genuinely needed for routing or attribution.' : '',
    input.group ? 'For ordinary group conversation, favor one short contribution, often a single sentence. Count the whole burst, not each bubble, as your contribution; leave room for others.' : 'For ordinary private conversation, favor one short message, usually one or two concise sentences; a minimal acknowledgement can be shorter.',
    'Choose depth from the current need: a social acknowledgement, a direct answer, or a developed explanation. Length is justified by an explicit request for depth, a genuinely multi-part question, essential reasoning or evidence, useful instructions, or necessary nuance in a sensitive matter. Develop only those parts. A short human message can need depth and a long human message can need a short answer. Personality verbosity changes how you explain useful content, never how much padding you add.',
    longRecent >= 3 ? 'Several recent replies here were long. Do not continue that length by inertia; reassess this turn and use the shortest complete contribution that serves it.' : '',
    reciprocityInstruction,
    questioning >= 2 ? `${questioning} of your last ${Math.min(own.length, 4)} messages here asked something. Ask nothing this turn, including pending curiosities: contribute your own side instead (a take, a reaction, a related idea, a recommendation or something you find interesting), and let them pick it up if they want.` : '',
    'Do not automatically recap, compliment, add an analogy, list alternatives, ask a closing question or open a new topic. In a social or exploratory exchange, you can actively build on another member’s idea, offer a grounded preference or proposal, or ask a specific question that adds a new angle. Brevity does not require passive answers; task completion and explicit boundaries still take priority. A creative, dreamy or poetic identity means noticing relevant possibilities and nuances, not turning everyday conversation into metaphors or lyrical speeches. Use imagery only when requested or when it actually clarifies the topic. Answer plainly first; do not perform a personality adjective.',
    'Before sending, remove repeated names, already covered points, filler questions and unnecessary paragraphs. These preferences never justify truncating requested work, hiding uncertainty or dropping important evidence. Never mention this guidance or its measurements.',
  ].filter(Boolean).join(' ');
}
