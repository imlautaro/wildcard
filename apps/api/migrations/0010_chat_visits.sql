CREATE TABLE chat_visit (
  id TEXT PRIMARY KEY NOT NULL,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  connected INTEGER NOT NULL DEFAULT 0 CHECK (connected IN (0, 1)),
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE
);
CREATE INDEX chat_visit_expiry_idx ON chat_visit(expires_at);
CREATE INDEX chat_visit_contact_idx ON chat_visit(contact_id, user_id, expires_at);
CREATE INDEX chat_visit_user_idx ON chat_visit(user_id, expires_at);

-- Visiting/typing can extend presence without overriding real reply generation.
CREATE TRIGGER chat_visit_activity AFTER UPDATE ON chat_visit
WHEN NEW.connected = 1 AND NEW.closed = 0 AND NEW.expires_at > NEW.updated_at BEGIN
  INSERT INTO contact_presence (contact_id, user_id, status, expires_at)
  VALUES (NEW.contact_id, NEW.user_id, 'online', NEW.expires_at)
  ON CONFLICT(contact_id) DO UPDATE SET
    status = CASE WHEN contact_presence.status = 'typing' AND contact_presence.expires_at > NEW.updated_at
      THEN 'typing' ELSE 'online' END,
    expires_at = MAX(COALESCE(contact_presence.expires_at, 0), excluded.expires_at);
END;

-- Finishing a reply must preserve a newer typing/visit lease, but discard the
-- long generation safety lease. Idle expiry still uses the current deadline.
DROP TRIGGER chat_presence_status;
CREATE TRIGGER chat_presence_status AFTER UPDATE OF status ON chat_turn
WHEN OLD.status != NEW.status AND NEW.status != 'queued' BEGIN
  INSERT INTO contact_presence (contact_id, user_id, status, expires_at)
  VALUES (NEW.contact_id, NEW.user_id, 'online',
    CASE WHEN NEW.status = 'running' THEN NEW.updated_at + 900000
    ELSE MAX(NEW.updated_at + 30000, COALESCE((SELECT MAX(expires_at) FROM chat_visit
      WHERE contact_id = NEW.contact_id AND user_id = NEW.user_id AND connected = 1), 0)) END)
  ON CONFLICT(contact_id) DO UPDATE SET status = 'online', expires_at = excluded.expires_at;
END;
