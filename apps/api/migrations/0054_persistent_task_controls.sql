-- Durable task progress and human-controlled execution. Existing tasks stay active.
ALTER TABLE task ADD COLUMN work_state TEXT NOT NULL DEFAULT 'active' CHECK (work_state IN ('active', 'paused', 'blocked'));
ALTER TABLE task ADD COLUMN next_step TEXT CHECK (next_step IS NULL OR length(next_step) <= 2000);
ALTER TABLE task ADD COLUMN evidence TEXT CHECK (evidence IS NULL OR length(evidence) <= 2000);
ALTER TABLE task ADD COLUMN blocked_reason TEXT CHECK (blocked_reason IS NULL OR length(blocked_reason) <= 2000);
-- Unlike the edit version, this changes only when execution authority changes.
ALTER TABLE task ADD COLUMN work_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task ADD COLUMN mutation_token TEXT;
ALTER TABLE task_work ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;

-- Preserve all previously recorded consumption, including earlier assignment cycles.
-- Pre-control turns have no execution authority under the new guards. The next
-- scheduled review may resume active tasks with any remaining budget.
UPDATE task SET work_generation = 1,
  work_count = MAX(work_count, (SELECT COUNT(*) FROM task_work WHERE task_id = task.id));
