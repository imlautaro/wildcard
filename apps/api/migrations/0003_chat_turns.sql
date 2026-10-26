CREATE UNIQUE INDEX contact_id_user_idx ON contact(id, user_id);
CREATE TABLE chat_turn (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  user_text TEXT NOT NULL,
  assistant_text TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  workflow_id TEXT NOT NULL UNIQUE,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE,
  CHECK (status != 'complete' OR assistant_text IS NOT NULL)
);
CREATE UNIQUE INDEX chat_one_active_turn_idx ON chat_turn(contact_id) WHERE status IN ('queued', 'running');
CREATE INDEX chat_contact_sequence_idx ON chat_turn(contact_id, sequence DESC);
CREATE INDEX chat_recovery_idx ON chat_turn(status, checked_at);
CREATE INDEX chat_user_status_idx ON chat_turn(user_id, status);
