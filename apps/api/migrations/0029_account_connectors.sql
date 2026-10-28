-- Preserve encrypted bytes and their original AAD scope; moving a connector must
-- not require reading/re-encrypting credentials or logging in again.
CREATE TABLE mcp_connector (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credential_scope TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  credential TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'oauth'))
);
CREATE INDEX mcp_connector_owner ON mcp_connector(user_id, created_at);
INSERT INTO mcp_connector SELECT id, user_id, contact_id, name, url, credential, tools_json, created_at, auth_type FROM mcp_connection;
CREATE TABLE mcp_contact_access (
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES mcp_connector(id) ON DELETE CASCADE,
  generation TEXT NOT NULL,
  PRIMARY KEY(contact_id, connection_id)
);
INSERT INTO mcp_contact_access SELECT contact_id, id, lower(hex(randomblob(16))) FROM mcp_connection;
-- Rebind OAuth foreign keys without changing tokens, generations or active flows.
CREATE TABLE mcp_oauth_saved AS SELECT * FROM mcp_oauth;
CREATE TABLE mcp_oauth_flow_saved AS SELECT * FROM mcp_oauth_flow;
DROP TABLE mcp_oauth_flow;
DROP TABLE mcp_oauth;
DROP TABLE mcp_connection;
CREATE TABLE mcp_oauth (
  connection_id TEXT PRIMARY KEY REFERENCES mcp_connector(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL,
  tokens_json TEXT,
  expires_at INTEGER,
  generation TEXT NOT NULL,
  refresh_lock TEXT,
  locked_until INTEGER
);
INSERT INTO mcp_oauth SELECT * FROM mcp_oauth_saved;
DROP TABLE mcp_oauth_saved;
CREATE TABLE mcp_oauth_flow (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL UNIQUE REFERENCES mcp_connector(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  generation TEXT NOT NULL,
  launch_hash TEXT UNIQUE,
  state_hash TEXT NOT NULL UNIQUE,
  browser_hash TEXT,
  proof_hash TEXT,
  payload_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO mcp_oauth_flow SELECT * FROM mcp_oauth_flow_saved;
DROP TABLE mcp_oauth_flow_saved;
CREATE INDEX mcp_oauth_flow_expiry ON mcp_oauth_flow(expires_at);
CREATE TABLE mcp_group_access (
  group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES mcp_connector(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  generation TEXT NOT NULL,
  PRIMARY KEY(group_id, agent_id, connection_id),
  FOREIGN KEY(group_id, agent_id) REFERENCES group_agent(group_id, agent_id) ON DELETE CASCADE
);
-- Group isolation survives revocation: history may contain external data.
CREATE TABLE mcp_private_group (
  group_id TEXT PRIMARY KEY REFERENCES chat_group(id) ON DELETE CASCADE
);
CREATE TABLE mcp_group_execution (
  turn_id TEXT NOT NULL REFERENCES group_reply(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  connection_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  result_json TEXT,
  uncertain INTEGER NOT NULL DEFAULT 1 CHECK (uncertain IN (0, 1)),
  auth_generation TEXT,
  access_generation TEXT NOT NULL,
  PRIMARY KEY(turn_id, slot),
  UNIQUE(turn_id, connection_id, tool_name, arguments_json)
);
