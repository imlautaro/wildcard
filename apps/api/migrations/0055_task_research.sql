-- A human supplies the exact public query. Assignment never grants web access.
ALTER TABLE task ADD COLUMN research_query TEXT CHECK (research_query IS NULL OR length(research_query) BETWEEN 1 AND 600);
ALTER TABLE task ADD COLUMN research_user_id TEXT REFERENCES user(id) ON DELETE SET NULL;
-- Lifetime consumption survives receipt/turn deletion and grant changes.
ALTER TABLE task ADD COLUMN research_count INTEGER NOT NULL DEFAULT 0 CHECK (research_count BETWEEN 0 AND 1);
ALTER TABLE web_research ADD COLUMN task_id TEXT REFERENCES task(id) ON DELETE CASCADE;
ALTER TABLE web_research ADD COLUMN task_generation INTEGER;
CREATE UNIQUE INDEX web_research_task ON web_research(task_id) WHERE task_id IS NOT NULL;
