// Aggregate the immutable recipient snapshot, including recipients who later leave.
export function receiptState(message: string): string {
  return `CASE WHEN ${message}.receipts_tracked = 0 THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM group_message_receipt r WHERE r.message_id = ${message}.id) THEN 'sent'
    WHEN NOT EXISTS (SELECT 1 FROM group_message_receipt r WHERE r.message_id = ${message}.id AND r.read_at IS NULL) THEN 'read'
    WHEN NOT EXISTS (SELECT 1 FROM group_message_receipt r WHERE r.message_id = ${message}.id AND r.delivered_at IS NULL) THEN 'received'
    ELSE 'sent' END`;
}

export async function acknowledgeAgentContext(db: D1Database, groupID: string, agentID: string, ids: string[]) {
  await db.prepare(`UPDATE group_message_receipt SET delivered_at = COALESCE(delivered_at, ?1), read_at = COALESCE(read_at, ?1)
    WHERE recipient_kind = 'agent' AND recipient_id = ?2 AND message_id IN (SELECT value FROM json_each(?3))
    AND EXISTS (SELECT 1 FROM group_agent ga WHERE ga.group_id = ?4 AND ga.agent_id = ?2)
    AND EXISTS (SELECT 1 FROM group_message gm WHERE gm.id = message_id AND gm.group_id = ?4)`)
    .bind(Date.now(), agentID, JSON.stringify([...new Set(ids)]), groupID).run();
}

// Only pass server-produced retrieval results after the next model response.
export async function acknowledgeGroupResults(db: D1Database, agentID: string, results: unknown[]) {
  const groups = new Map<string, string[]>();
  for (const row of results) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.groupID !== 'string' || typeof r.messageID !== 'string') continue;
    const ids = groups.get(r.groupID) ?? [];
    ids.push(r.messageID);
    groups.set(r.groupID, ids);
  }
  for (const [groupID, ids] of groups) await acknowledgeAgentContext(db, groupID, agentID, ids);
}
