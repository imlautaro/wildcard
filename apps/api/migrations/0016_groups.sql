CREATE TABLE chat_group (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at INTEGER NOT NULL
);
CREATE TABLE group_member (
  group_id TEXT NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  can_invite INTEGER NOT NULL DEFAULT 0 CHECK (can_invite IN (0, 1)),
  share_memory INTEGER NOT NULL CHECK (share_memory = 1),
  contributor_consent INTEGER NOT NULL DEFAULT 0 CHECK (contributor_consent IN (0, 1)),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_member_user_idx ON group_member(user_id, group_id);
CREATE TABLE group_agent (
  group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, agent_id),
  FOREIGN KEY (group_id, added_by) REFERENCES group_member(group_id, user_id) ON DELETE CASCADE
);
CREATE TABLE group_invite (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (group_id, sender_id) REFERENCES group_member(group_id, user_id) ON DELETE CASCADE,
  UNIQUE (group_id, recipient_id)
);
CREATE INDEX group_invite_recipient_idx ON group_invite(recipient_id, expires_at);
CREATE TABLE group_message (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES contact_agent(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  contributor_consent INTEGER NOT NULL DEFAULT 0 CHECK (contributor_consent IN (0, 1)),
  round_enqueued INTEGER NOT NULL DEFAULT 0 CHECK (round_enqueued IN (0, 1)),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX group_message_history_idx ON group_message(group_id, sequence DESC);
CREATE TABLE group_reply (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1,
  workflow_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (group_id, agent_id) REFERENCES group_agent(group_id, agent_id) ON DELETE CASCADE,
  UNIQUE (source_id, agent_id)
);
CREATE INDEX group_reply_pending_idx ON group_reply(status, created_at, sequence);
CREATE TRIGGER group_attention_required BEFORE UPDATE OF status ON group_reply
WHEN NEW.status = 'running' AND NOT EXISTS (
  SELECT 1 FROM agent_attention WHERE agent_id = NEW.agent_id AND turn_id = NEW.id AND attempt = NEW.attempt
) BEGIN
  SELECT RAISE(ABORT, 'Agent attention is required');
END;
CREATE TABLE group_memory (
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'decision', 'pending')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
  source_id TEXT NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  source_quote TEXT NOT NULL CHECK (length(source_quote) BETWEEN 1 AND 240),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, user_id, memory_key)
);
