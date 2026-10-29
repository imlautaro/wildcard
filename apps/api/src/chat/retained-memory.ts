import type { Memory } from './memory';
import type { AgentMemory } from './agent-memory';

export async function retainedGroupMemories(db: D1Database, agentID: string, contributor: boolean,
  local?: { groupID: string; userID: string }): Promise<Memory[]> {
  const {results}=await db.prepare(`SELECT m.user_id AS sourceUserID,u.name AS sourceUserName,m.memory_key AS key,
    m.kind,m.content,'' AS sourceTurnID,'' AS sourceQuote,0 AS sourceSequence,m.updated_at AS updatedAt
    FROM retained_group_memory m JOIN user u ON u.id=m.user_id
    JOIN group_member author ON author.group_id=m.group_id AND author.user_id=m.user_id AND author.share_memory=1
    JOIN group_agent ga ON ga.group_id=m.group_id AND ga.agent_id=m.agent_id
    WHERE m.agent_id=?1 AND m.category=?2
      AND (?3 IS NULL AND NOT EXISTS(SELECT 1 FROM mcp_private_group WHERE group_id=m.group_id)
        OR m.group_id=?3 AND EXISTS(SELECT 1 FROM mcp_private_group WHERE group_id=m.group_id)
          AND EXISTS(SELECT 1 FROM group_member WHERE group_id=m.group_id AND user_id=?4 AND share_memory=1))
      AND (?5=0 OR (m.contributor_consent=1 AND author.contributor_consent=1))
    ORDER BY m.updated_at DESC LIMIT 128`).bind(agentID,local?'local_human':'human',local?.groupID??null,local?.userID??null,contributor?1:0).all<Memory>();
  return results;
}

export async function retainedGroupSelf(db: D1Database, agentID: string, contributor: boolean, userID: string|null, scope: string|null): Promise<AgentMemory[]> {
  const {results}=await db.prepare(`SELECT m.agent_id AS agentID,a.name AS agentName,m.memory_key AS key,m.kind,m.content,
    0 AS sourceSequence,'' AS sourceQuote,m.updated_at AS updatedAt FROM retained_group_memory m
    JOIN contact_agent a ON a.id=m.agent_id JOIN group_agent ga ON ga.agent_id=m.agent_id AND ga.group_id=m.group_id
    WHERE m.agent_id=?1 AND m.category=?2
      AND (?3 IS NULL AND NOT EXISTS(SELECT 1 FROM mcp_private_group WHERE group_id=m.group_id)
        OR ?3='group:'||m.group_id AND EXISTS(SELECT 1 FROM mcp_private_group WHERE group_id=m.group_id)
          AND EXISTS(SELECT 1 FROM group_member WHERE group_id=m.group_id AND user_id=?4 AND share_memory=1))
      AND (?5=0 OR (m.contributor_consent=1 AND NOT EXISTS(SELECT 1 FROM group_member WHERE group_id=m.group_id AND contributor_consent=0)))
    ORDER BY m.updated_at DESC LIMIT 64`).bind(agentID,scope?'local_self':'self',scope,userID,contributor?1:0).all<AgentMemory>();
  return results;
}
