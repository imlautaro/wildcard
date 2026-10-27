-- One durable extraction event per saved agent reply, independent of its audience.
CREATE TABLE agent_memory_event (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  private_turn_id TEXT UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_message_id TEXT UNIQUE REFERENCES group_message(id) ON DELETE CASCADE,
  processed INTEGER NOT NULL DEFAULT 0 CHECK (processed IN (0, 1)),
  CHECK ((private_turn_id IS NOT NULL) != (group_message_id IS NOT NULL))
);
CREATE INDEX agent_memory_event_pending_idx ON agent_memory_event(agent_id, processed, sequence);
CREATE TABLE agent_memory (
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL CHECK (length(memory_key) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'decision', 'pending')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
  source_event_sequence INTEGER NOT NULL REFERENCES agent_memory_event(sequence) ON DELETE CASCADE,
  source_quote TEXT NOT NULL CHECK (length(source_quote) BETWEEN 1 AND 240),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, memory_key)
);
CREATE INDEX agent_memory_source_idx ON agent_memory(source_event_sequence);
CREATE TRIGGER agent_memory_private_reply AFTER UPDATE OF status ON chat_turn
WHEN NEW.status = 'complete' AND OLD.status != 'complete' AND NEW.assistant_text IS NOT NULL BEGIN
  INSERT INTO agent_memory_event(agent_id, private_turn_id)
    SELECT agent_id, NEW.id FROM contact WHERE id = NEW.contact_id
    ON CONFLICT(private_turn_id) DO NOTHING;
END;
CREATE TRIGGER agent_memory_group_reply AFTER INSERT ON group_message
WHEN NEW.agent_id IS NOT NULL BEGIN
  INSERT INTO agent_memory_event(agent_id, group_message_id) VALUES (NEW.agent_id, NEW.id)
    ON CONFLICT(group_message_id) DO NOTHING;
END;
CREATE TRIGGER agent_memory_group_removed AFTER DELETE ON group_agent BEGIN
  DELETE FROM agent_memory_event WHERE agent_id = OLD.agent_id AND group_message_id IN (
    SELECT id FROM group_message WHERE group_id = OLD.group_id AND agent_id = OLD.agent_id);
END;
-- Metadata backfill only. Workflow maintenance performs bounded inference later.
INSERT INTO agent_memory_event(agent_id, private_turn_id, group_message_id)
  SELECT agent_id, private_turn_id, group_message_id FROM (
    SELECT c.agent_id, t.id AS private_turn_id, NULL AS group_message_id, t.updated_at AS saved_at
      FROM chat_turn t JOIN contact c ON c.id = t.contact_id
      WHERE t.status = 'complete' AND t.assistant_text IS NOT NULL
    UNION ALL
    SELECT agent_id, NULL, id, created_at FROM group_message WHERE agent_id IS NOT NULL
  ) ORDER BY saved_at, COALESCE(private_turn_id, group_message_id);

-- Store group text once. Agents retrieve authorized sources instead of copying
-- every bot statement to every observing agent's profile.
CREATE VIRTUAL TABLE group_message_search USING fts5(
  text, sender_name, content='group_message', content_rowid='sequence',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER group_message_search_insert AFTER INSERT ON group_message BEGIN
  INSERT INTO group_message_search(rowid, text, sender_name) VALUES (NEW.sequence, NEW.text, NEW.sender_name);
END;
CREATE TRIGGER group_message_search_delete AFTER DELETE ON group_message BEGIN
  INSERT INTO group_message_search(group_message_search, rowid, text, sender_name)
    VALUES ('delete', OLD.sequence, OLD.text, OLD.sender_name);
END;
CREATE TRIGGER group_message_search_update AFTER UPDATE OF text, sender_name ON group_message BEGIN
  INSERT INTO group_message_search(group_message_search, rowid, text, sender_name)
    VALUES ('delete', OLD.sequence, OLD.text, OLD.sender_name);
  INSERT INTO group_message_search(rowid, text, sender_name) VALUES (NEW.sequence, NEW.text, NEW.sender_name);
END;
INSERT INTO group_message_search(group_message_search) VALUES ('rebuild');
CREATE INDEX group_agent_agent_idx ON group_agent(agent_id, group_id);
