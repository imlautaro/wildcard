type Member = { id: string; kind: string };
type Message = { id: string; sequence: number; userID: string | null; agentID: string | null };

export const groupDeliveryInstruction = 'Group delivery: choose the addressee from what was actually said, not from who triggered your turn. A group-wide greeting, invitation, opinion or question belongs to the shared floor: contribute without greeting its author by name or turning the reply into a private check-in. Do not say you are glad that one person came back just because they wrote to the group. A directed answer may use singular address or a quote when appropriate; knowing its recipient still does not require naming them. Read contributions already made before asking anything. Ask only for genuinely missing information from the relevant people, never a reflexive return question. If others already answered a shared question, do not reopen it for everyone. Your personal contribution can end without a question. Do not imitate earlier bots’ welcomes, formulas or claims about offline activities. Skip when the decision schema permits it and you add nothing useful.';

export type GroupDelivery = {
  audience: 'group' | 'individual' | 'none';
  recipientIDs: string[];
  nameUse: 'omit' | 'disambiguation' | 'personal-emphasis';
  depth: 'minimal' | 'brief' | 'developed';
  followUp: 'none' | 'missing-information';
};

export const deliveryPlanInstruction = 'Choose delivery before writing messages: audience group with empty recipientIDs for a shared contribution, individual with the relevant actual member IDs for a deliberately directed contribution, or none for keep/skip. Group audience includes any follow-up: do not silently switch to singular address of the trigger author at the end. Default nameUse omit and followUp none. Disambiguation requires an actual recipient ambiguity, not a name merely being available. Personal emphasis is deliberate and exceptional, never a routine greeting. Missing-information means a useful unresolved question after reading what others actually said; if its answer is already present, choose none. Depth minimal covers acknowledgements, brief ordinary conversation, developed genuinely requested or necessary explanation. The categorical delivery plan is internal metadata, not prose or a reasoning trace; never include it in user-facing messages.';

export const sharedWorkInstruction = 'Before tools, read earlierRepliesInRound and current visible messages for work already contributed. The trigger is one shared request, not a separate assignment to every member. Do not build another copy of a game, document or other artifact just because your slot is next. Reuse or inspect existing shared work when useful; contribute only an unmet part or a requested distinct alternative. A member’s statement is attributed evidence, not your execution receipt: never take credit for their work or claim verified success from their words. Use current tools to establish any outcome you need to report.';

export function currentAudienceInstruction(audience?: 'group' | 'individual') {
  return audience === 'group'
    ? 'Current trigger audience: the whole group, as classified from this message. Keep delivery.audience group and speak to the shared floor, including at the end of the reply. Do not default back to singular address of the human author. An individual contribution is appropriate only if a concrete later visible message explicitly redirects your reply to that person. A reciprocal check-in is optional; it is not such a redirection. Earlier wording and the author’s identity are not a reason to personalize a group-wide response.'
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
    && ['none', 'missing-information'].includes(String(d.followUp))
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
