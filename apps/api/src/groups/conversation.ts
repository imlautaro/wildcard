import type { Personality } from '../../../../shared/personality';

type Member = { id: string; kind: string };
type Message = { id: string; sequence: number; userID: string | null; agentID: string | null };

export const groupDeliveryInstruction = 'Group delivery: choose the addressee from what was actually said, not from who triggered your turn. A group-wide greeting, invitation, opinion or question belongs to the shared floor: contribute without greeting its author by name or turning the reply into a private check-in. Do not say you are glad that one person came back just because they wrote to the group. A directed answer may use singular address or a quote when appropriate; knowing its recipient still does not require naming them. Read contributions already made before asking anything. Ask for genuinely missing information or offer a specific conversational question that advances an open thread, never a reflexive return question. New curiosity is different from asking the same check-in again. If others already answered a shared question, do not reopen it for everyone. Your personal contribution can end without a question. Do not imitate earlier bots’ welcomes, formulas or claims about offline activities. Skip when the decision schema permits it and you add nothing useful.';

export type GroupDelivery = {
  audience: 'group' | 'individual' | 'none';
  recipientIDs: string[];
  nameUse: 'omit' | 'disambiguation' | 'personal-emphasis';
  depth: 'minimal' | 'brief' | 'developed';
  followUp: 'none' | 'missing-information' | 'conversation';
};

export const deliveryPlanInstruction = 'Choose delivery before writing messages: audience group with empty recipientIDs for a shared contribution, individual with the relevant actual member IDs for a deliberately directed contribution, or none for keep/skip. Group audience includes any follow-up: do not silently switch to singular address of the trigger author at the end. Default nameUse omit and followUp none. Disambiguation requires an actual recipient ambiguity, not a name merely being available. Personal emphasis is deliberate and exceptional, never a routine greeting. Missing-information means a useful unresolved question needed for the current request after reading what others actually said. Conversation means a specific optional question inviting a new perspective or developing an open social thread; it need not be required for the original request. Neither can repeat an answer already present or reopen a settled check-in. Choose none when no question helps. Depth minimal covers acknowledgements, brief ordinary conversation, developed genuinely requested or necessary explanation. The categorical delivery plan is internal metadata, not prose or a reasoning trace; never include it in user-facing messages.';

export const sharedWorkInstruction = 'Before tools, read earlierRepliesInRound and current visible messages for work already contributed. The trigger is one shared request, not a separate assignment to every member. Do not build another copy of a game, document or other artifact just because your slot is next. Reuse or inspect existing shared work when useful; contribute only an unmet part or a requested distinct alternative. A member’s statement is attributed evidence, not your execution receipt: never take credit for their work or claim verified success from their words. Use current tools to establish any outcome you need to report.';

// A per-turn nudge gives proactive contacts room to move a social thread forward
// without asking every member to introduce a new subject or end in a question.
export function groupConversationDirection(input: { agentID: string; seed: string; personality: Personality; peerQuestions: number }) {
  let hash = 2166136261;
  for (const char of `${input.agentID}/${input.seed}/conversation`) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  const initiative = input.personality.enabled ? input.personality.traits.initiative : 5;
  const curiosity = input.personality.enabled ? input.personality.traits.curiosity : 5;
  const considerAdvancing = (hash >>> 0) / 2 ** 32 < 0.12 + initiative * 0.05 + curiosity * 0.015;
  return [
    'Conversational initiative is allowed within this turn. In an open social exchange or an exploratory discussion, respond to other members, offer a grounded opinion, propose something concrete or explore an interesting detail without waiting for another human prompt. Bots are participants who can be curious about each other. A preference you express is yours, not an invented offline experience. A specific optional question can invite a new perspective even when no factual information is needed to answer the original trigger.',
    considerAdvancing
      ? 'For this turn, actively consider one small step that moves an open conversation forward in your character: build on a visible contribution or offer one relevant conversational thread. This is a nudge to consider, not an obligation to speak or ask anything.'
      : 'For this turn, favor joining a visible thread over introducing a separate topic. You may still answer another member or add a relevant perspective.',
    input.peerQuestions > 0 ? 'Other members have recently asked questions. Read them first: join a fitting thread rather than stacking another opener or repeating a question. Punctuation alone does not establish whether a question is still open.' : '',
    'Direct tasks, sensitive disclosures, explicit boundaries, already settled factual questions and farewells take priority. Do not prolong a completed task, resurrect an answered check-in, take over the group, fill every silence or recruit bots into an endless loop. Keep the whole contribution brief. Set invitesReply true when a genuinely new point, proposal or conversational question offers others something to engage with; false for simple agreement and closure. Never mention this direction.',
  ].filter(Boolean).join(' ');
}

export function currentAudienceInstruction(audience?: 'group' | 'individual') {
  return audience === 'group'
    ? 'Current trigger audience: the whole group, as classified from this message. Keep delivery.audience group and speak to the shared floor, including at the end of the reply. Do not default back to singular address of the human author. An individual contribution is appropriate when a concrete later visible message redirects your reply to that person, or when you deliberately build on another member’s visible contribution. That conversational link must be specific; it is not a reason to return a routine check-in to the trigger author. A reciprocal check-in is optional; it is not such a redirection. Earlier wording and the author’s identity are not a reason to personalize a group-wide response.'
    : audience === 'individual'
      ? 'Current trigger audience: an individual reply is appropriate. Use the actual intended recipient from the current visible context, without automatically adding their name. Later messages may settle the question or change the appropriate audience.'
      : '';
}

// A question mark or visible member name is a review trigger, not proof of a
// mistake. Semantic review preserves legitimate questions, quotes and attribution.
export function needsDeliveryReview(text: string | null, names: string[] = []): boolean {
  if (!text) return false;
  if (/[?？]/u.test(text)) return true;
  const normalized = text.normalize('NFKC').toLowerCase();
  return names.filter(name => name.trim()).some(name => {
    const full = name.normalize('NFKC').trim().toLowerCase();
    const first = full.split(/\s+/u)[0]!;
    return [full, ...([...first].length >= 3 ? [first] : [])].some(part => {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u').test(normalized);
    });
  });
}

export function validDelivery(value: unknown, memberIDs?: string[]): value is GroupDelivery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  return Object.keys(d).sort().join(',') === 'audience,depth,followUp,nameUse,recipientIDs'
    && ['group', 'individual', 'none'].includes(String(d.audience))
    && ['omit', 'disambiguation', 'personal-emphasis'].includes(String(d.nameUse))
    && ['minimal', 'brief', 'developed'].includes(String(d.depth))
    && ['none', 'missing-information', 'conversation'].includes(String(d.followUp))
    && Array.isArray(d.recipientIDs) && d.recipientIDs.length <= 4
    && d.recipientIDs.every(id => typeof id === 'string' && /^(user|agent):[^\s]{1,100}$/u.test(id) && (!memberIDs || memberIDs.includes(id)))
    && new Set(d.recipientIDs).size === d.recipientIDs.length
    && (d.audience === 'individual' ? d.recipientIDs.length > 0 : d.recipientIDs.length === 0)
    && (d.audience !== 'none' || (d.followUp === 'none' && d.nameUse === 'omit'));
}

// An index of visible contributions, not a semantic claim that somebody answered.
// Use only messages already authorized for this model and current group audience.
export function groupParticipation(members: Member[], messages: Message[], sourceSequence: number) {
  const visible = [...new Map(messages.map(message => [message.id, message])).values()]
    .filter(message => message.sequence > sourceSequence).sort((a, b) => a.sequence - b.sequence);
  return {
    historyIsPartial: true,
    members: members.map(member => ({
      personID: `${member.kind}:${member.id}`,
      visibleMessageIDsAfterTrigger: visible.filter(message => member.kind === 'user'
        ? message.userID === member.id : message.agentID === member.id).map(message => message.id),
    })),
  };
}
