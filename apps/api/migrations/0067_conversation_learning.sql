-- Learning is local to one agent, person and audience. It never enters shared memory.
ALTER TABLE contact ADD COLUMN learning_enabled INTEGER NOT NULL DEFAULT 1 CHECK (learning_enabled IN (0, 1));
ALTER TABLE contact ADD COLUMN learning_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact ADD COLUMN learning_since INTEGER NOT NULL DEFAULT 0;
ALTER TABLE group_member ADD COLUMN learning_enabled INTEGER NOT NULL DEFAULT 1 CHECK (learning_enabled IN (0, 1));
ALTER TABLE group_member ADD COLUMN learning_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE group_member ADD COLUMN learning_since INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_group ADD COLUMN learning_revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE conversation_learning (
  scope_key TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES chat_group(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  through_sequence INTEGER NOT NULL DEFAULT 0,
  attempted_at INTEGER NOT NULL DEFAULT 0,
  reviewed_at INTEGER NOT NULL DEFAULT 0,
  isolated INTEGER NOT NULL CHECK (isolated IN (0, 1)),
  contributor_eligible INTEGER NOT NULL DEFAULT 0 CHECK (contributor_eligible IN (0, 1)),
  profile_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(profile_json)),
  PRIMARY KEY (scope_key, agent_id, user_id),
  FOREIGN KEY (group_id, agent_id) REFERENCES group_agent(group_id, agent_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, user_id) REFERENCES group_member(group_id, user_id) ON DELETE CASCADE,
  CHECK ((contact_id IS NOT NULL AND group_id IS NULL AND scope_key = 'contact:' || contact_id)
    OR (group_id IS NOT NULL AND contact_id IS NULL AND scope_key = 'group:' || group_id))
);
CREATE INDEX conversation_learning_contact ON conversation_learning(contact_id);
CREATE INDEX conversation_learning_group ON conversation_learning(group_id);

-- Discard derived state on source removal, even when factual memory is retained.
CREATE TRIGGER learning_private_deleted AFTER DELETE ON chat_turn BEGIN
  DELETE FROM conversation_learning WHERE contact_id = OLD.contact_id;
END;
CREATE TRIGGER learning_group_deleted AFTER DELETE ON group_message BEGIN
  DELETE FROM conversation_learning WHERE group_id = OLD.group_id;
END;
CREATE TRIGGER learning_member_left AFTER DELETE ON group_member BEGIN
  DELETE FROM conversation_learning WHERE group_id = OLD.group_id;
  UPDATE chat_group SET learning_revision = learning_revision + 1 WHERE id = OLD.group_id;
END;
CREATE TRIGGER learning_member_joined AFTER INSERT ON group_member BEGIN
  DELETE FROM conversation_learning WHERE group_id = NEW.group_id;
  UPDATE chat_group SET learning_revision = learning_revision + 1 WHERE id = NEW.group_id;
END;
CREATE TRIGGER learning_member_changed AFTER UPDATE OF share_memory, contributor_consent, learning_enabled ON group_member
WHEN NEW.share_memory != OLD.share_memory OR NEW.contributor_consent != OLD.contributor_consent OR NEW.learning_enabled != OLD.learning_enabled BEGIN
  DELETE FROM conversation_learning WHERE group_id = NEW.group_id;
  UPDATE chat_group SET learning_revision = learning_revision + 1 WHERE id = NEW.group_id;
END;
CREATE TRIGGER learning_agent_left AFTER DELETE ON group_agent BEGIN
  DELETE FROM conversation_learning WHERE group_id = OLD.group_id;
  UPDATE chat_group SET learning_revision = learning_revision + 1 WHERE id = OLD.group_id;
END;
CREATE TRIGGER learning_private_isolated AFTER INSERT ON mcp_private_contact BEGIN
  DELETE FROM conversation_learning WHERE contact_id = NEW.contact_id;
  UPDATE contact SET learning_revision = learning_revision + 1 WHERE id = NEW.contact_id;
END;
CREATE TRIGGER learning_group_isolated AFTER INSERT ON mcp_private_group BEGIN
  DELETE FROM conversation_learning WHERE group_id = NEW.group_id;
  UPDATE chat_group SET learning_revision = learning_revision + 1 WHERE id = NEW.group_id;
END;
