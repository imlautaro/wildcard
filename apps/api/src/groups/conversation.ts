type Member = { id: string; kind: string };
type Message = { id: string; sequence: number; userID: string | null; agentID: string | null };

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
