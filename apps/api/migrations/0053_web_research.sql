-- One paid research request per human trigger, including all replies in a group.
-- Reservations survive retries and ambiguous provider outcomes.
CREATE TABLE web_research (
  id TEXT PRIMARY KEY NOT NULL,
  budget_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  chat_turn_id TEXT UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_reply_id TEXT REFERENCES group_reply(id) ON DELETE CASCADE,
  group_source_id TEXT UNIQUE REFERENCES group_message(id) ON DELETE CASCADE,
  query TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 600),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  model TEXT NOT NULL CHECK (model IN ('muse-spark-1.3', 'muse-spark-1.3-contributor')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'complete', 'failed')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error_code TEXT,
  document_id TEXT REFERENCES chat_document(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  CHECK ((chat_turn_id IS NOT NULL AND group_reply_id IS NULL AND group_source_id IS NULL)
    OR (chat_turn_id IS NULL AND group_reply_id IS NOT NULL AND group_source_id IS NOT NULL))
);
-- Content-free budget events survive parent deletion so deleting a chat cannot
-- refund paid attempts. Expired events are pruned during the next admission.
CREATE TABLE web_research_usage (
  id TEXT PRIMARY KEY NOT NULL,
  account_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX web_research_usage_account ON web_research_usage(account_key, created_at);
CREATE INDEX web_research_usage_created ON web_research_usage(created_at);
ALTER TABLE chat_document ADD COLUMN research_json TEXT CHECK (research_json IS NULL OR json_valid(research_json));
