-- Runtime settings that super admins change from apps/admin without a redeploy.
-- Definitions and defaults live in src/admin/settings.ts; no row means the default.
CREATE TABLE app_setting (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Append-only record of super admin actions. Actor and target are plain IDs, not
-- foreign keys, so entries survive either account's deletion. No email or name
-- of a deleted account is stored here.
CREATE TABLE admin_event (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_event_created_idx ON admin_event(created_at DESC);
