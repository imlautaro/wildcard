// Internal aliases are supplied by code, never by a model or HTTP parameter.
// Apply at admission, inference, publication and push; a private instruction does
// not grant access to a group after the requester or either agent has left it.
export function groupRequestAccess(alias: string, contributor: boolean) {
  return `EXISTS (SELECT 1 FROM chat_turn origin JOIN contact private_contact
      ON private_contact.id = origin.contact_id AND private_contact.user_id = origin.user_id
      JOIN contact_agent sender ON sender.id = private_contact.agent_id
      JOIN contact_agent target ON target.id = ${alias}.target_agent_id
      JOIN group_member requester ON requester.group_id = ${alias}.group_id AND requester.user_id = origin.user_id
      WHERE origin.id = ${alias}.source_turn_id AND origin.user_id = ${alias}.requester_id
        AND origin.schedule_id IS NULL AND origin.group_request_id IS NULL
        AND sender.id = ${alias}.sender_agent_id AND sender.memory_shared = 1 AND target.memory_shared = 1
        AND EXISTS (SELECT 1 FROM contact WHERE agent_id = sender.id AND user_id = sender.owner_id)
        AND EXISTS (SELECT 1 FROM contact WHERE agent_id = target.id AND user_id = target.owner_id)
        AND EXISTS (SELECT 1 FROM group_agent WHERE group_id = ${alias}.group_id AND agent_id = sender.id)
        AND EXISTS (SELECT 1 FROM group_agent WHERE group_id = ${alias}.group_id AND agent_id = target.id)
        AND requester.share_memory = 1
        ${contributor ? `AND (private_contact.user_id = sender.owner_id OR private_contact.contributor_consent = 1)
          AND NOT EXISTS (SELECT 1 FROM group_member WHERE group_id = ${alias}.group_id AND contributor_consent = 0)` : ''})`;
}

export function groupRequestTurnAllowed(table: string, contributor: boolean) {
  return `(${table}.group_request_id IS NULL OR EXISTS (SELECT 1 FROM group_request request
    JOIN chat_turn origin ON origin.id = request.source_turn_id
    WHERE request.id = ${table}.group_request_id AND request.requester_id = ${table}.user_id
      AND origin.contact_id = ${table}.contact_id AND request.status IN ('queued', 'complete')
      AND ${groupRequestAccess('request', contributor)}
      AND EXISTS (SELECT 1 FROM group_message question WHERE question.id = request.id
        AND question.request_id = request.id AND question.group_id = request.group_id AND question.agent_id = request.sender_agent_id)
      AND (request.result_kind != 'answered' OR EXISTS (SELECT 1 FROM group_message answer
        WHERE answer.id = 'group-' || request.id || '-' || request.target_agent_id
          AND answer.group_id = request.group_id AND answer.agent_id = request.target_agent_id))
      ${contributor ? `AND EXISTS (SELECT 1 FROM group_message question WHERE question.id = request.id AND question.contributor_consent = 1)
        AND (request.result_kind != 'answered' OR EXISTS (SELECT 1 FROM group_message answer
          WHERE answer.id = 'group-' || request.id || '-' || request.target_agent_id AND answer.contributor_consent = 1))` : ''}))`;
}

// Human messages retain their original authorization path. A bot message may
// trigger exactly one reply only through its server-recorded human delegation.
export function groupSourceAccess(reply: string, contributor: boolean) {
  return `EXISTS (SELECT 1 FROM group_message source WHERE source.id = ${reply}.source_id
    AND source.group_id = ${reply}.group_id ${contributor ? 'AND source.contributor_consent = 1' : ''}
    AND ((source.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_member author
      WHERE author.group_id = source.group_id AND author.user_id = source.user_id AND author.share_memory = 1
      ${contributor ? 'AND author.contributor_consent = 1' : ''}))
    OR (source.user_id IS NULL AND EXISTS (SELECT 1 FROM group_request request
      WHERE request.id = source.request_id AND request.id = source.id AND request.group_id = source.group_id
        AND request.sender_agent_id = source.agent_id AND request.target_agent_id = ${reply}.agent_id
        AND request.status = 'waiting' AND request.expires_at > unixepoch() * 1000
        AND ${groupRequestAccess('request', contributor)}))))`;
}
