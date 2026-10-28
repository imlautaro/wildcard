-- Explicit per-participant device grants. No autonomous initiative dispatch is enabled.
CREATE TABLE native_remote_device (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  push_device_id TEXT NOT NULL REFERENCES push_device(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, installation_id)
);
CREATE TABLE native_remote_grant (
  device_id TEXT NOT NULL REFERENCES native_remote_device(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  kinds_json TEXT NOT NULL DEFAULT '["timer","alarm"]',
  PRIMARY KEY(device_id, contact_id)
);
ALTER TABLE native_action ADD COLUMN remote_device_id TEXT; -- Retain operation receipts after device/session revocation.
ALTER TABLE native_action ADD COLUMN remote_nonce TEXT;
ALTER TABLE native_action ADD COLUMN fire_at INTEGER;
ALTER TABLE native_action ADD COLUMN push_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE native_action ADD COLUMN push_next_at INTEGER;
CREATE INDEX native_action_remote_pending ON native_action(status, push_next_at) WHERE remote_device_id IS NOT NULL;
