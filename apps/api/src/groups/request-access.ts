// Internal aliases are supplied by code, never by a model or HTTP parameter.
// Apply at admission, inference, publication and push; a private instruction does
// not grant access to a group after the requester or either agent has left it.
export function groupPublicationAccess(alias: string, contributor: boolean) {
  return `EXISTS (SELECT 1 FROM chat_turn origin JOIN contact private_contact
      ON private_contact.id = origin.contact_id AND private_contact.user_id = origin.user_id
      JOIN contact_agent sender ON sender.id = private_contact.agent_id
      JOIN group_member requester ON requester.group_id = ${alias}.group_id AND requester.user_id = origin.user_id
      WHERE origin.id = ${alias}.source_turn_id AND origin.user_id = ${alias}.requester_id
        AND origin.schedule_id IS NULL AND origin.group_request_id IS NULL
        AND sender.id = ${alias}.sender_agent_id AND sender.memory_shared = 1
        AND EXISTS (SELECT 1 FROM contact WHERE agent_id = sender.id AND user_id = sender.owner_id)
        AND EXISTS (SELECT 1 FROM group_agent WHERE group_id = ${alias}.group_id AND agent_id = sender.id)
        AND requester.share_memory = 1
        ${contributor ? `AND (private_contact.user_id = sender.owner_id OR private_contact.contributor_consent = 1)
          AND NOT EXISTS (SELECT 1 FROM group_member WHERE group_id = ${alias}.group_id AND contributor_consent = 0)` : ''})`;
}

export function groupRequestAccess(alias: string, contributor: boolean) {
  return `(${groupPublicationAccess(alias, contributor)} AND EXISTS (SELECT 1 FROM contact_agent target
    JOIN group_agent member ON member.agent_id = target.id AND member.group_id = ${alias}.group_id
    WHERE target.id = ${alias}.target_agent_id AND target.memory_shared = 1
      AND EXISTS (SELECT 1 FROM contact WHERE agent_id = target.id AND user_id = target.owner_id)))`;
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

// Separate authorization branches with UNION ALL rather than nesting receipt
// predicates inside OR trees. D1 limits SQL expression depth to 100, including
// the surrounding context/publication query. Keep current access checks intact.
export function groupSourceAccess(reply: string, contributor: boolean) {
  const source = `source.id = ${reply}.source_id AND source.group_id = ${reply}.group_id
    ${contributor ? 'AND source.contributor_consent = 1' : ''}`;
  const continuation = `FROM group_message source
    JOIN group_message root ON root.id = source.exchange_id AND root.group_id = source.group_id
      AND root.requester_id = source.requester_id
    JOIN group_member requester ON requester.group_id = source.group_id AND requester.user_id = source.requester_id
    JOIN group_agent speaker ON speaker.group_id = source.group_id AND speaker.agent_id = source.agent_id
    JOIN contact_agent agent ON agent.id = speaker.agent_id
    JOIN contact owner_contact ON owner_contact.agent_id = agent.id AND owner_contact.user_id = agent.owner_id`;
  const continuedAccess = `${source} AND source.agent_id IS NOT NULL AND source.request_id IS NULL
    AND requester.share_memory = 1 AND agent.memory_shared = 1
    ${contributor ? 'AND requester.contributor_consent = 1 AND root.contributor_consent = 1' : ''}`;
  return `EXISTS (
    SELECT 1 FROM group_message source JOIN group_member author
      ON author.group_id = source.group_id AND author.user_id = source.user_id
    WHERE ${source} AND author.share_memory = 1
      ${contributor ? 'AND author.contributor_consent = 1' : ''}
    UNION ALL
    SELECT 1 FROM group_message source JOIN group_request request
      ON request.id = source.request_id AND request.id = source.id AND request.group_id = source.group_id
        AND request.sender_agent_id = source.agent_id AND request.target_agent_id = ${reply}.agent_id
    WHERE ${source} AND source.user_id IS NULL AND request.status = 'waiting'
      AND request.expires_at > unixepoch() * 1000 AND ${groupRequestAccess('request', contributor)}
    UNION ALL
    SELECT 1 ${continuation} WHERE ${continuedAccess} AND root.user_id = source.requester_id
    UNION ALL
    SELECT 1 ${continuation} JOIN group_post post ON post.id = root.id
    WHERE ${continuedAccess} AND post.status = 'published' AND ${groupPublicationAccess('post', contributor)}
    UNION ALL
    SELECT 1 ${continuation} JOIN group_request request ON request.id = root.id
    WHERE ${continuedAccess} AND request.status != 'cancelled' AND ${groupRequestAccess('request', contributor)}
  )`;
}
