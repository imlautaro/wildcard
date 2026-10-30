-- A thorough group investigation splits one human message across two or three
-- researchers, each with its own receipt. SQLite cannot drop the UNIQUE
-- constraint on group_source_id, so rebuild this leaf table (nothing references
-- it): one research receipt per group reply instead of per group message.
CREATE TABLE web_research_split (
  id TEXT PRIMARY KEY NOT NULL,
  budget_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  chat_turn_id TEXT UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_reply_id TEXT REFERENCES group_reply(id) ON DELETE CASCADE,
  group_source_id TEXT REFERENCES group_message(id) ON DELETE CASCADE,
  query TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 600),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  model TEXT NOT NULL CHECK (model IN ('muse-spark-1.3', 'muse-spark-1.3-contributor')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'complete', 'failed')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error_code TEXT,
  document_id TEXT REFERENCES chat_document(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  task_id TEXT REFERENCES task(id) ON DELETE CASCADE,
  task_generation INTEGER,
  delivery TEXT NOT NULL DEFAULT 'document' CHECK (delivery IN ('conversation', 'document')),
  CHECK ((chat_turn_id IS NOT NULL AND group_reply_id IS NULL AND group_source_id IS NULL)
    OR (chat_turn_id IS NULL AND group_reply_id IS NOT NULL AND group_source_id IS NOT NULL))
);
INSERT INTO web_research_split (id, budget_id, user_id, agent_id, chat_turn_id, group_reply_id, group_source_id,
  query, title, model, status, result_json, error_code, document_id, created_at, task_id, task_generation, delivery)
SELECT id, budget_id, user_id, agent_id, chat_turn_id, group_reply_id, group_source_id,
  query, title, model, status, result_json, error_code, document_id, created_at, task_id, task_generation, delivery
FROM web_research;
DROP TABLE web_research;
ALTER TABLE web_research_split RENAME TO web_research;
CREATE UNIQUE INDEX web_research_task ON web_research(task_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX web_research_group_reply ON web_research(group_reply_id) WHERE group_reply_id IS NOT NULL;
CREATE INDEX web_research_group_source ON web_research(group_source_id) WHERE group_source_id IS NOT NULL;
