ALTER TABLE mcp_connection ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'oauth'));
UPDATE mcp_connection SET auth_type = 'bearer' WHERE credential IS NOT NULL;
CREATE TABLE mcp_oauth (
  connection_id TEXT PRIMARY KEY REFERENCES mcp_connection(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL,
  tokens_json TEXT,
  expires_at INTEGER,
  generation TEXT NOT NULL,
  refresh_lock TEXT,
  locked_until INTEGER
);
CREATE TABLE mcp_oauth_flow (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL UNIQUE REFERENCES mcp_connection(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  generation TEXT NOT NULL,
  launch_hash TEXT UNIQUE,
  state_hash TEXT NOT NULL UNIQUE,
  browser_hash TEXT,
  proof_hash TEXT,
  payload_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX mcp_oauth_flow_expiry ON mcp_oauth_flow(expires_at);

ALTER TABLE mcp_execution ADD COLUMN auth_generation TEXT;
