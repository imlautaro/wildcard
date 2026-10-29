-- Markdown documents in chats. A private document belongs to one participant's chat
-- with a contact; a group document belongs to the group. Contacts and humans edit
-- them; every change is an attributed revision.
CREATE TABLE chat_document (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES chat_group(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (length(body) <= 100000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  -- The private turn or group reply that created it; its card shows under that message.
  source_id TEXT,
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('user', 'agent')),
  created_by_id TEXT NOT NULL,
  updated_by_kind TEXT NOT NULL CHECK (updated_by_kind IN ('user', 'agent')),
  updated_by_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((group_id IS NULL) = (contact_id IS NOT NULL) AND (contact_id IS NULL) = (user_id IS NULL))
);
CREATE INDEX chat_document_contact ON chat_document(contact_id, user_id, updated_at);
CREATE INDEX chat_document_group ON chat_document(group_id, updated_at);

CREATE TABLE chat_document_revision (
  document_id TEXT NOT NULL REFERENCES chat_document(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  summary TEXT CHECK (summary IS NULL OR length(summary) <= 300),
  author_kind TEXT NOT NULL CHECK (author_kind IN ('user', 'agent')),
  author_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, revision)
);

-- Receipts for contact document tools, keyed by turn and call.
CREATE TABLE document_mutation (
  id TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
