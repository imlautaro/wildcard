// Internal SQL aliases only. A delivered message remains in history after sharing
// ends, but pending notifications require the original contact instances/access.
export function privateRelayAllowed(turn: string) {
  return `(${turn}.is_private_relay = 0 OR EXISTS (SELECT 1 FROM private_contact_message relay
    JOIN contact source ON source.id = relay.source_contact_id
    JOIN contact target ON target.id = relay.target_contact_id
    JOIN contact_agent agent ON agent.id = source.agent_id AND agent.id = target.agent_id
    WHERE relay.target_turn_id = ${turn}.id AND target.id = ${turn}.contact_id
      AND agent.memory_shared = 1
      AND EXISTS (SELECT 1 FROM contact owner WHERE owner.agent_id = agent.id AND owner.user_id = agent.owner_id)
      AND NOT EXISTS (SELECT 1 FROM mcp_private_contact WHERE contact_id IN (source.id, target.id))
      AND (relay.contributor = 0 OR ((source.user_id = agent.owner_id OR source.contributor_consent = 1)
        AND (target.user_id = agent.owner_id OR target.contributor_consent = 1)))))`;
}
