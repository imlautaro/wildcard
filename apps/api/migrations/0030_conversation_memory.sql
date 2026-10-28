-- Local profiles never share keys or capacity with another conversation.
CREATE TABLE group_local_memory (
  group_id TEXT NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL CHECK (length(memory_key) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'decision', 'pending')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
  source_id TEXT NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  source_quote TEXT NOT NULL CHECK (length(source_quote) BETWEEN 1 AND 240),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, agent_id, user_id, memory_key)
);
CREATE INDEX group_local_memory_source ON group_local_memory(source_id);
CREATE TABLE agent_local_memory (
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL CHECK (scope_key LIKE 'private:%' OR scope_key LIKE 'group:%'),
  memory_key TEXT NOT NULL CHECK (length(memory_key) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'decision', 'pending')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
  source_event_sequence INTEGER NOT NULL REFERENCES agent_memory_event(sequence) ON DELETE CASCADE,
  source_quote TEXT NOT NULL CHECK (length(source_quote) BETWEEN 1 AND 240),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, scope_key, memory_key)
);
CREATE INDEX agent_local_memory_source ON agent_local_memory(source_event_sequence);

-- Preserve previously learned keys whose sources are already isolated. No inference.
INSERT INTO group_local_memory
  SELECT gm.group_id, m.* FROM group_memory m JOIN group_message gm ON gm.id = m.source_id
  JOIN mcp_private_group p ON p.group_id = gm.group_id;
INSERT INTO agent_local_memory
  SELECT m.agent_id, 'private:' || t.contact_id, m.memory_key, m.kind, m.content,
    m.source_event_sequence, m.source_quote, m.updated_at
  FROM agent_memory m JOIN agent_memory_event e ON e.sequence = m.source_event_sequence
  JOIN chat_turn t ON t.id = e.private_turn_id JOIN mcp_private_contact p ON p.contact_id = t.contact_id;
INSERT INTO agent_local_memory
  SELECT m.agent_id, 'group:' || gm.group_id, m.memory_key, m.kind, m.content,
    m.source_event_sequence, m.source_quote, m.updated_at
  FROM agent_memory m JOIN agent_memory_event e ON e.sequence = m.source_event_sequence
  JOIN group_message gm ON gm.id = e.group_message_id JOIN mcp_private_group p ON p.group_id = gm.group_id;

-- Future isolation retains existing knowledge locally; shared readers still reject
-- its original sources. Existing shared tables remain compatible with older jobs.
CREATE TRIGGER local_memory_contact_isolated AFTER INSERT ON mcp_private_contact BEGIN
  INSERT OR IGNORE INTO agent_local_memory
    SELECT m.agent_id, 'private:' || NEW.contact_id, m.memory_key, m.kind, m.content,
      m.source_event_sequence, m.source_quote, m.updated_at
    FROM agent_memory m JOIN agent_memory_event e ON e.sequence = m.source_event_sequence
    JOIN chat_turn t ON t.id = e.private_turn_id WHERE t.contact_id = NEW.contact_id;
END;
CREATE TRIGGER local_memory_group_isolated AFTER INSERT ON mcp_private_group BEGIN
  INSERT OR IGNORE INTO group_local_memory
    SELECT gm.group_id, m.* FROM group_memory m JOIN group_message gm ON gm.id = m.source_id
    WHERE gm.group_id = NEW.group_id;
  INSERT OR IGNORE INTO agent_local_memory
    SELECT m.agent_id, 'group:' || NEW.group_id, m.memory_key, m.kind, m.content,
      m.source_event_sequence, m.source_quote, m.updated_at
    FROM agent_memory m JOIN agent_memory_event e ON e.sequence = m.source_event_sequence
    JOIN group_message gm ON gm.id = e.group_message_id WHERE gm.group_id = NEW.group_id;
END;
