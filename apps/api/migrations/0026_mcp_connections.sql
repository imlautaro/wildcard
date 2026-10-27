-- Isolation survives disconnect: historical connector output remains private.
CREATE TABLE mcp_private_contact (
  contact_id TEXT PRIMARY KEY REFERENCES contact(id) ON DELETE CASCADE
);
CREATE TABLE mcp_connection (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  credential TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX mcp_connection_contact ON mcp_connection(contact_id, user_id);
CREATE TABLE mcp_execution (
  turn_id TEXT NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  connection_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  result_json TEXT,
  uncertain INTEGER NOT NULL DEFAULT 1 CHECK (uncertain IN (0, 1)),
  PRIMARY KEY(turn_id, slot),
  UNIQUE(turn_id, connection_id, tool_name, arguments_json)
);
