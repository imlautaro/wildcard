-- Device actions are proposals, never evidence of execution on a phone.
ALTER TABLE chat_turn ADD COLUMN native_context_json TEXT;
CREATE TABLE native_action (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled','unknown')),
  execution_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(turn_id, kind)
);
CREATE INDEX native_action_turn ON native_action(turn_id, created_at);
