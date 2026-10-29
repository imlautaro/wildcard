-- A person saves one exact public URL for a task assigned to a contact. The Worker
-- checks it with code on a fixed interval and gives the contact a turn only for new,
-- relevant content. Assignment never grants monitoring.
ALTER TABLE task ADD COLUMN monitor_url TEXT CHECK (monitor_url IS NULL OR length(monitor_url) BETWEEN 1 AND 2048);
ALTER TABLE task ADD COLUMN monitor_keywords TEXT CHECK (monitor_keywords IS NULL OR length(monitor_keywords) BETWEEN 1 AND 300);
ALTER TABLE task ADD COLUMN monitor_interval INTEGER NOT NULL DEFAULT 360 CHECK (monitor_interval IN (60, 360, 1440));
ALTER TABLE task ADD COLUMN monitor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN monitor_due_at INTEGER;
-- Set by a relevant change; cleared in the same batch that admits the contact turn.
ALTER TABLE task ADD COLUMN monitor_pending_at INTEGER;
-- Lifetime change turns, separate from work turns. Never refunded.
ALTER TABLE task ADD COLUMN monitor_turns INTEGER NOT NULL DEFAULT 0;
CREATE INDEX task_monitor_due ON task(monitor_due_at) WHERE monitor_due_at IS NOT NULL;
CREATE INDEX task_monitor_pending ON task(monitor_pending_at) WHERE monitor_pending_at IS NOT NULL;
CREATE INDEX task_monitor_user ON task(monitor_user_id) WHERE monitor_url IS NOT NULL;

-- Latest normalized text for diffs. Removed when the URL changes or is revoked.
CREATE TABLE task_monitor_state (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  hash TEXT NOT NULL,
  recent_hashes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recent_hashes)),
  snapshot TEXT NOT NULL CHECK (length(snapshot) <= 65536),
  checked_at INTEGER NOT NULL,
  changed_at INTEGER
);

-- Bounded check log (latest 20 per task) shown on both boards.
CREATE TABLE task_monitor_check (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  generation INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('baseline', 'unchanged', 'repeated', 'ignored', 'changed', 'failed')),
  http_status INTEGER,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  excerpt TEXT CHECK (excerpt IS NULL OR length(excerpt) <= 3000),
  checked_at INTEGER NOT NULL
);
CREATE INDEX task_monitor_check_task ON task_monitor_check(task_id, checked_at);
