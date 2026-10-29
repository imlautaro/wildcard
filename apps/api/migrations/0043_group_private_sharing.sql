-- Each participant can grant only their own private conversation to one audience.
CREATE TABLE group_private_sharing (
  group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, agent_id, user_id),
  FOREIGN KEY (group_id, agent_id) REFERENCES group_agent(group_id, agent_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, user_id) REFERENCES group_member(group_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE
);
-- Complete affected attempts so checkpointed drafts/results cannot survive a
-- revocation, regrant, membership removal, or permanent connector isolation.
CREATE TRIGGER group_private_sharing_removed AFTER DELETE ON group_private_sharing BEGIN
  UPDATE group_reply SET status = 'complete' WHERE group_id = OLD.group_id AND agent_id = OLD.agent_id
    AND status IN ('queued', 'running', 'failed');
END;
CREATE TRIGGER group_private_contact_isolated AFTER INSERT ON mcp_private_contact BEGIN
  DELETE FROM group_private_sharing WHERE contact_id = NEW.contact_id;
END;
CREATE TRIGGER group_private_contact_consent AFTER UPDATE OF contributor_consent ON contact
WHEN OLD.contributor_consent IS NOT NEW.contributor_consent BEGIN
  UPDATE group_reply SET status = 'complete' WHERE status IN ('queued', 'running', 'failed')
    AND EXISTS (SELECT 1 FROM group_private_sharing s WHERE s.contact_id = NEW.id
      AND s.group_id = group_reply.group_id AND s.agent_id = group_reply.agent_id);
END;
