CREATE TABLE contact_presence (
  contact_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('offline', 'online', 'typing')),
  last_seen_at INTEGER,
  expires_at INTEGER,
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE
);
CREATE INDEX contact_presence_expiry_idx ON contact_presence(expires_at) WHERE expires_at IS NOT NULL;

-- Existing completed work is historical activity, not a new connection.
INSERT INTO contact_presence (contact_id, user_id, status, last_seen_at, expires_at)
SELECT contact_id, user_id,
  CASE WHEN status IN ('queued', 'running') THEN 'online' ELSE 'offline' END,
  CASE WHEN status IN ('complete', 'failed') THEN updated_at ELSE NULL END,
  CASE WHEN status IN ('queued', 'running') THEN updated_at + 900000 ELSE NULL END
FROM chat_turn t WHERE sequence = (SELECT MAX(sequence) FROM chat_turn WHERE contact_id = t.contact_id);

CREATE TRIGGER chat_presence_insert AFTER INSERT ON chat_turn BEGIN
  INSERT INTO contact_presence (contact_id, user_id, status, expires_at)
  VALUES (NEW.contact_id, NEW.user_id, 'online', NEW.updated_at + 900000)
  ON CONFLICT(contact_id) DO UPDATE SET status = 'online', expires_at = excluded.expires_at;
END;

CREATE TRIGGER chat_presence_status AFTER UPDATE OF status ON chat_turn
WHEN OLD.status != NEW.status BEGIN
  INSERT INTO contact_presence (contact_id, user_id, status, expires_at)
  VALUES (NEW.contact_id, NEW.user_id, 'online',
    NEW.updated_at + CASE WHEN NEW.status IN ('queued', 'running') THEN 900000 ELSE 30000 END)
  ON CONFLICT(contact_id) DO UPDATE SET status = 'online', expires_at = excluded.expires_at;
END;
