-- One explicitly authorized group question per human private turn. Keep the
-- receipt after membership revocation so retries cannot publish it again.
CREATE TABLE group_request (
  id TEXT PRIMARY KEY NOT NULL,
  source_turn_id TEXT NOT NULL UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES chat_group(id) ON DELETE SET NULL,
  requester_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sender_agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  target_agent_id TEXT REFERENCES contact_agent(id) ON DELETE SET NULL,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'queued', 'complete', 'cancelled')),
  result_kind TEXT CHECK (result_kind IN ('answered', 'skipped', 'failed', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0,
  CHECK (sender_agent_id != target_agent_id),
  CHECK (status = 'cancelled' OR (group_id IS NOT NULL AND target_agent_id IS NOT NULL))
);
CREATE INDEX group_request_pending_idx ON group_request(status, created_at);
CREATE INDEX group_request_recovery_idx ON group_request(status, checked_at, created_at);
CREATE INDEX group_request_group_idx ON group_request(group_id, requester_id);
CREATE INDEX group_request_requester_idx ON group_request(requester_id, status);
ALTER TABLE group_message ADD COLUMN request_id TEXT REFERENCES group_request(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX group_message_request_idx ON group_message(request_id) WHERE request_id IS NOT NULL;
ALTER TABLE chat_turn ADD COLUMN group_request_id TEXT REFERENCES group_request(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX chat_group_request_idx ON chat_turn(group_request_id) WHERE group_request_id IS NOT NULL;

-- Revocation never unlocks an in-flight agent. Workflow/recovery owns the claim.
CREATE TRIGGER group_request_cancel AFTER UPDATE OF status ON group_request
WHEN NEW.status = 'cancelled' AND OLD.status != 'cancelled' BEGIN
  UPDATE group_reply SET status = 'failed' WHERE source_id = NEW.id AND status IN ('queued', 'running');
  UPDATE chat_turn SET status = 'failed', error_code = 'GROUP_REQUEST_CANCELLED', updated_at = unixepoch() * 1000
    WHERE group_request_id = NEW.id AND status IN ('queued', 'running');
  DELETE FROM push_delivery WHERE turn_id IN (SELECT id FROM chat_turn WHERE group_request_id = NEW.id);
END;
CREATE TRIGGER group_request_member_removed AFTER DELETE ON group_member BEGIN
  UPDATE group_request SET status = 'cancelled' WHERE group_id = OLD.group_id AND requester_id = OLD.user_id
    AND status != 'cancelled';
END;
CREATE TRIGGER group_request_agent_removed AFTER DELETE ON group_agent BEGIN
  UPDATE group_request SET status = 'cancelled' WHERE group_id = OLD.group_id
    AND (sender_agent_id = OLD.agent_id OR target_agent_id = OLD.agent_id) AND status != 'cancelled';
END;
CREATE TRIGGER group_request_group_deleted BEFORE DELETE ON chat_group BEGIN
  UPDATE group_request SET status = 'cancelled' WHERE group_id = OLD.id AND status != 'cancelled';
END;
CREATE TRIGGER group_request_target_deleted BEFORE DELETE ON contact_agent BEGIN
  UPDATE group_request SET status = 'cancelled' WHERE target_agent_id = OLD.id AND status != 'cancelled';
END;
CREATE TRIGGER group_request_consent_revoked AFTER UPDATE OF contributor_consent ON group_member
WHEN OLD.contributor_consent = 1 AND NEW.contributor_consent = 0 BEGIN
  UPDATE group_request SET status = 'cancelled' WHERE group_id = NEW.group_id AND status != 'cancelled';
END;

-- Questions and relayed answers are not statements of the sender's own persona.
DROP TRIGGER agent_memory_private_reply;
CREATE TRIGGER agent_memory_private_reply AFTER UPDATE OF status ON chat_turn
WHEN NEW.status = 'complete' AND OLD.status != 'complete' AND NEW.assistant_text IS NOT NULL
  AND NEW.group_request_id IS NULL BEGIN
  INSERT INTO agent_memory_event(agent_id, private_turn_id)
    SELECT agent_id, NEW.id FROM contact WHERE id = NEW.contact_id
    ON CONFLICT(private_turn_id) DO NOTHING;
END;
DROP TRIGGER agent_memory_group_reply;
CREATE TRIGGER agent_memory_group_reply AFTER INSERT ON group_message
WHEN NEW.agent_id IS NOT NULL AND NEW.request_id IS NULL BEGIN
  INSERT INTO agent_memory_event(agent_id, group_message_id) VALUES (NEW.agent_id, NEW.id)
    ON CONFLICT(group_message_id) DO NOTHING;
END;
