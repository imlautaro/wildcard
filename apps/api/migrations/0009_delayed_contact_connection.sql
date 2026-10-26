-- Queue acceptance does not connect the agent. Preserve any existing presence;
-- the Workflow connects it when actual processing starts after its durable wait.
DROP TRIGGER chat_presence_insert;
CREATE TRIGGER chat_presence_insert AFTER INSERT ON chat_turn BEGIN
  INSERT INTO contact_presence (contact_id, user_id, status)
  VALUES (NEW.contact_id, NEW.user_id, 'offline')
  ON CONFLICT(contact_id) DO NOTHING;
END;

DROP TRIGGER chat_presence_status;
CREATE TRIGGER chat_presence_status AFTER UPDATE OF status ON chat_turn
WHEN OLD.status != NEW.status AND NEW.status != 'queued' BEGIN
  INSERT INTO contact_presence (contact_id, user_id, status, expires_at)
  VALUES (NEW.contact_id, NEW.user_id, 'online',
    NEW.updated_at + CASE WHEN NEW.status = 'running' THEN 900000 ELSE 30000 END)
  ON CONFLICT(contact_id) DO UPDATE SET status = 'online', expires_at = excluded.expires_at;
END;
