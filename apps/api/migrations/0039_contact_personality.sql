CREATE TABLE agent_personality (
  agent_id TEXT PRIMARY KEY NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL
);

-- Pending appraisals affect later turns only after their reply is published.
-- No excerpts, diagnoses, reasoning traces, or private cross-chat profiles.
CREATE TABLE personality_event (
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES chat_group(id) ON DELETE CASCADE,
  private_turn_id TEXT REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_reply_id TEXT REFERENCES group_reply(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL,
  profile_revision INTEGER NOT NULL,
  appraisal_json TEXT NOT NULL CHECK (json_valid(appraisal_json)),
  created_at INTEGER NOT NULL,
  contributor INTEGER NOT NULL CHECK (contributor IN (0, 1)),
  PRIMARY KEY (agent_id, source_id),
  CHECK ((contact_id IS NOT NULL AND private_turn_id IS NOT NULL AND group_id IS NULL AND group_reply_id IS NULL)
    OR (group_id IS NOT NULL AND group_reply_id IS NOT NULL AND contact_id IS NULL AND private_turn_id IS NULL))
);
CREATE INDEX personality_private_idx ON personality_event(agent_id, contact_id, created_at DESC);
CREATE INDEX personality_group_idx ON personality_event(agent_id, group_id, created_at DESC);
CREATE INDEX personality_expiry_idx ON personality_event(created_at);

CREATE TRIGGER personality_group_removed AFTER DELETE ON group_agent BEGIN
  DELETE FROM personality_event WHERE group_id = OLD.group_id
    AND (agent_id = OLD.agent_id OR speaker_id = 'agent:' || OLD.agent_id);
END;
CREATE TRIGGER personality_member_privacy AFTER UPDATE OF share_memory ON group_member WHEN NEW.share_memory = 0 BEGIN
  DELETE FROM personality_event WHERE group_id = NEW.group_id AND speaker_id = 'user:' || NEW.user_id;
END;
CREATE TRIGGER personality_member_removed AFTER DELETE ON group_member BEGIN
  DELETE FROM personality_event WHERE group_id = OLD.group_id AND speaker_id = 'user:' || OLD.user_id;
END;
CREATE TRIGGER personality_profile_changed AFTER UPDATE ON agent_personality BEGIN
  DELETE FROM personality_event WHERE agent_id = NEW.agent_id;
END;
