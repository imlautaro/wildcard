-- Contact-built mini apps: a declarative spec, an explicit per-revision grant and a
-- write ledger. Resolved connector data is never stored here.
CREATE TABLE mini_app (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES chat_turn(id) ON DELETE SET NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  title TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  approved_revision INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX mini_app_contact ON mini_app(contact_id, user_id, updated_at);
CREATE TABLE mini_app_action (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES mini_app(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'unknown')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX mini_app_action_app ON mini_app_action(app_id, created_at);
