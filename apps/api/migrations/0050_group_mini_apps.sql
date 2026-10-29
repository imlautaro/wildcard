-- Group mini apps: a contact in a group can build an app whose saved state every
-- member shares. A row now belongs either to one person's private chat
-- (contact_id + user_id) or to a group (group_id), never both.
--
-- SQLite cannot relax NOT NULL in place, so the three tables are rebuilt. The new
-- children reference mini_app_new while the old tables are dropped, so dropping the
-- old parent cascades into nothing; the renames then repoint their foreign keys.
CREATE TABLE mini_app_new (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES chat_group(id) ON DELETE CASCADE,
  -- The group reply whose published message shows the card (its message ID).
  reply_id TEXT REFERENCES group_reply(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES contact_agent(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES chat_turn(id) ON DELETE SET NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  title TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  approved_revision INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((group_id IS NULL AND contact_id IS NOT NULL AND user_id IS NOT NULL)
    OR (group_id IS NOT NULL AND contact_id IS NULL AND user_id IS NULL AND tools_json = '[]'))
);
INSERT INTO mini_app_new (id, contact_id, user_id, turn_id, revision, title, spec_json, tools_json, approved_revision, last_error, created_at, updated_at)
  SELECT id, contact_id, user_id, turn_id, revision, title, spec_json, tools_json, approved_revision, last_error, created_at, updated_at FROM mini_app;

CREATE TABLE mini_app_action_new (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES mini_app_new(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'unknown')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO mini_app_action_new SELECT id, app_id, revision, action_id, arguments_json, status, created_at, updated_at FROM mini_app_action;

CREATE TABLE mini_app_state_new (
  app_id TEXT PRIMARY KEY REFERENCES mini_app_new(id) ON DELETE CASCADE,
  values_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  last_execution TEXT,
  updated_at INTEGER NOT NULL
);
INSERT INTO mini_app_state_new SELECT app_id, values_json, version, last_execution, updated_at FROM mini_app_state;

DROP TABLE mini_app_action;
DROP TABLE mini_app_state;
DROP TABLE mini_app;
ALTER TABLE mini_app_new RENAME TO mini_app;
ALTER TABLE mini_app_action_new RENAME TO mini_app_action;
ALTER TABLE mini_app_state_new RENAME TO mini_app_state;
CREATE INDEX mini_app_contact ON mini_app(contact_id, user_id, updated_at);
CREATE INDEX mini_app_group ON mini_app(group_id, updated_at) WHERE group_id IS NOT NULL;
CREATE INDEX mini_app_action_app ON mini_app_action(app_id, created_at);
