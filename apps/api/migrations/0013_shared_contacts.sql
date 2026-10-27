-- A contact row is a participant's private conversation with one shared agent.
-- Keep existing conversation IDs and foreign keys intact during the migration.
CREATE TABLE contact_agent (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_version TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  memory_shared INTEGER NOT NULL DEFAULT 0 CHECK (memory_shared IN (0, 1))
);
ALTER TABLE contact ADD COLUMN agent_id TEXT REFERENCES contact_agent(id) ON DELETE CASCADE;
ALTER TABLE contact ADD COLUMN contributor_consent INTEGER NOT NULL DEFAULT 0 CHECK (contributor_consent IN (0, 1));
INSERT INTO contact_agent (id, owner_id, name, photo_version, updated_at)
  SELECT id, user_id, name, photo_version, updated_at FROM contact;
UPDATE contact SET agent_id = id;
CREATE UNIQUE INDEX contact_agent_user_idx ON contact(agent_id, user_id);
ALTER TABLE chat_turn ADD COLUMN read_at INTEGER;
UPDATE chat_turn SET read_at = updated_at WHERE status IN ('running', 'complete');

-- Metadata is a projection of the agent, never an independent participant copy.
CREATE TRIGGER contact_agent_create AFTER INSERT ON contact WHEN NEW.agent_id IS NULL BEGIN
  INSERT INTO contact_agent (id, owner_id, name, photo_version, updated_at)
    VALUES (NEW.id, NEW.user_id, NEW.name, NEW.photo_version, NEW.updated_at);
  UPDATE contact SET agent_id = NEW.id WHERE id = NEW.id;
END;
CREATE TRIGGER contact_agent_metadata AFTER UPDATE OF name, photo_version ON contact_agent BEGIN
  UPDATE contact SET name = NEW.name, photo_version = NEW.photo_version, updated_at = NEW.updated_at
    WHERE agent_id = NEW.id;
END;
CREATE TRIGGER contact_owner_metadata AFTER UPDATE OF name, photo_version ON contact
WHEN (NEW.name IS NOT OLD.name OR NEW.photo_version IS NOT OLD.photo_version)
  AND EXISTS (SELECT 1 FROM contact_agent WHERE id = NEW.agent_id AND owner_id = NEW.user_id
    AND (name IS NOT NEW.name OR photo_version IS NOT NEW.photo_version)) BEGIN
  UPDATE contact_agent SET name = NEW.name, photo_version = NEW.photo_version, updated_at = NEW.updated_at
    WHERE id = NEW.agent_id;
END;

CREATE TABLE contact_invite (
  token TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  accepted_by TEXT REFERENCES user(id) ON DELETE CASCADE,
  contributor_consent INTEGER NOT NULL DEFAULT 0 CHECK (contributor_consent IN (0, 1))
);
CREATE INDEX contact_invite_agent_idx ON contact_invite(agent_id, expires_at);

-- No turn FK: deleting a participant cannot unlock an in-flight model request.
-- Recovery releases abandoned claims only after the Workflow is terminal.
CREATE TABLE agent_attention (
  agent_id TEXT PRIMARY KEY NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL UNIQUE,
  attempt INTEGER NOT NULL,
  workflow_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX agent_attention_recovery_idx ON agent_attention(checked_at, acquired_at);
INSERT INTO agent_attention (agent_id, turn_id, attempt, workflow_id, acquired_at)
  SELECT c.agent_id, t.id, t.attempt, t.workflow_id, t.updated_at
  FROM chat_turn t JOIN contact c ON c.id = t.contact_id
  WHERE t.status IN ('queued', 'running');

-- Enforce exclusive processing at the database boundary as well as dispatch.
CREATE TRIGGER agent_attention_required BEFORE UPDATE OF status ON chat_turn
WHEN NEW.status = 'running' AND NOT EXISTS (
  SELECT 1 FROM agent_attention a JOIN contact c ON c.agent_id = a.agent_id
  WHERE c.id = NEW.contact_id AND a.turn_id = NEW.id AND a.attempt = NEW.attempt
) BEGIN
  SELECT RAISE(ABORT, 'Agent attention is required');
END;

CREATE TABLE agent_presence (
  agent_id TEXT PRIMARY KEY NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('offline', 'online', 'typing')),
  last_seen_at INTEGER,
  expires_at INTEGER
);
INSERT INTO agent_presence SELECT c.agent_id, p.status, p.last_seen_at, p.expires_at
  FROM contact_presence p JOIN contact c ON c.id = p.contact_id;
CREATE INDEX agent_presence_expiry_idx ON agent_presence(expires_at);
DROP TRIGGER chat_presence_insert;
DROP TRIGGER chat_presence_status;
DROP TRIGGER chat_visit_activity;

CREATE TRIGGER agent_chat_insert AFTER INSERT ON chat_turn BEGIN
  INSERT INTO agent_presence (agent_id, status)
    SELECT agent_id, 'offline' FROM contact WHERE id = NEW.contact_id
    ON CONFLICT(agent_id) DO NOTHING;
END;
CREATE TRIGGER agent_chat_status AFTER UPDATE OF status ON chat_turn
WHEN OLD.status != NEW.status AND NEW.status != 'queued'
  AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = NEW.id AND attempt = NEW.attempt) BEGIN
  INSERT INTO agent_presence (agent_id, status, expires_at)
    SELECT agent_id, 'online', CASE WHEN NEW.status = 'running' THEN NEW.updated_at + 900000
      ELSE NEW.updated_at + 30000 END FROM contact WHERE id = NEW.contact_id
    ON CONFLICT(agent_id) DO UPDATE SET status = 'online', expires_at = excluded.expires_at;
END;
CREATE TRIGGER agent_visit_activity AFTER UPDATE ON chat_visit
WHEN NEW.connected = 1 AND NEW.closed = 0 AND NEW.expires_at > NEW.updated_at BEGIN
  INSERT INTO agent_presence (agent_id, status, expires_at)
    SELECT c.agent_id, 'online', NEW.expires_at FROM contact c WHERE c.id = NEW.contact_id
      AND NOT EXISTS (SELECT 1 FROM agent_attention a WHERE a.agent_id = c.agent_id)
    ON CONFLICT(agent_id) DO UPDATE SET status = 'online',
      expires_at = MAX(COALESCE(agent_presence.expires_at, 0), excluded.expires_at);
END;
