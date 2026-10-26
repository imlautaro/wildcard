CREATE UNIQUE INDEX chat_turn_source_idx ON chat_turn(id, contact_id, user_id);

CREATE TABLE contact_memory_state (
  contact_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE
);

CREATE TABLE contact_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  memory_key TEXT NOT NULL CHECK (length(memory_key) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'decision', 'pending')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
  source_turn_id TEXT NOT NULL,
  source_quote TEXT NOT NULL CHECK (length(source_quote) BETWEEN 1 AND 240),
  source_sequence INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (source_turn_id, contact_id, user_id) REFERENCES chat_turn(id, contact_id, user_id) ON DELETE CASCADE,
  UNIQUE (contact_id, user_id, memory_key)
);
CREATE INDEX contact_memory_scope_idx ON contact_memory(contact_id, user_id, source_sequence DESC);

-- External-content FTS avoids duplicating conversation text. Triggers also work
-- with the previous Worker version during the additive migration/release window.
CREATE VIRTUAL TABLE chat_turn_search USING fts5(
  user_text, assistant_text, content='chat_turn', content_rowid='sequence',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER chat_turn_search_insert AFTER INSERT ON chat_turn BEGIN
  INSERT INTO chat_turn_search(rowid, user_text, assistant_text)
    VALUES (new.sequence, new.user_text, new.assistant_text);
END;
CREATE TRIGGER chat_turn_search_delete AFTER DELETE ON chat_turn BEGIN
  INSERT INTO chat_turn_search(chat_turn_search, rowid, user_text, assistant_text)
    VALUES ('delete', old.sequence, old.user_text, old.assistant_text);
END;
CREATE TRIGGER chat_turn_search_update AFTER UPDATE OF user_text, assistant_text ON chat_turn BEGIN
  INSERT INTO chat_turn_search(chat_turn_search, rowid, user_text, assistant_text)
    VALUES ('delete', old.sequence, old.user_text, old.assistant_text);
  INSERT INTO chat_turn_search(rowid, user_text, assistant_text)
    VALUES (new.sequence, new.user_text, new.assistant_text);
END;
INSERT INTO chat_turn_search(chat_turn_search) VALUES ('rebuild');
