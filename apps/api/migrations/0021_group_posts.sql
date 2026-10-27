-- Plain group publications do not require another agent or an automatic reply.
-- Keep the existing directed requests and their in-flight Workflows intact.
CREATE TABLE group_post (
  id TEXT PRIMARY KEY NOT NULL,
  source_turn_id TEXT NOT NULL UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES chat_group(id) ON DELETE SET NULL,
  requester_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sender_agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'revoked')),
  created_at INTEGER NOT NULL,
  CHECK (status = 'revoked' OR group_id IS NOT NULL)
);
CREATE INDEX group_post_group_idx ON group_post(group_id, requester_id);
-- One publication across both kinds, even if a replay switches tools or modes.
CREATE TRIGGER group_post_one_publication BEFORE INSERT ON group_post
WHEN EXISTS (SELECT 1 FROM group_request WHERE source_turn_id = NEW.source_turn_id) BEGIN
  SELECT RAISE(IGNORE);
END;
CREATE TRIGGER group_request_one_publication BEFORE INSERT ON group_request
WHEN EXISTS (SELECT 1 FROM group_post WHERE source_turn_id = NEW.source_turn_id) BEGIN
  SELECT RAISE(IGNORE);
END;
CREATE TRIGGER group_post_member_removed AFTER DELETE ON group_member BEGIN
  UPDATE group_post SET status = 'revoked' WHERE group_id = OLD.group_id AND requester_id = OLD.user_id;
END;
CREATE TRIGGER group_post_agent_removed AFTER DELETE ON group_agent BEGIN
  UPDATE group_post SET status = 'revoked' WHERE group_id = OLD.group_id AND sender_agent_id = OLD.agent_id;
END;
CREATE TRIGGER group_post_group_deleted BEFORE DELETE ON chat_group BEGIN
  UPDATE group_post SET status = 'revoked' WHERE group_id = OLD.id;
END;
CREATE TRIGGER group_post_consent_revoked AFTER UPDATE OF contributor_consent ON group_member
WHEN OLD.contributor_consent = 1 AND NEW.contributor_consent = 0 BEGIN
  UPDATE group_post SET status = 'revoked' WHERE group_id = NEW.group_id;
END;

-- A human-directed publication alone does not change the sender's own persona.
DROP TRIGGER agent_memory_group_reply;
CREATE TRIGGER agent_memory_group_reply AFTER INSERT ON group_message
WHEN NEW.agent_id IS NOT NULL AND NEW.request_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM group_post WHERE id = NEW.id) BEGIN
  INSERT INTO agent_memory_event(agent_id, group_message_id) VALUES (NEW.agent_id, NEW.id)
    ON CONFLICT(group_message_id) DO NOTHING;
END;
