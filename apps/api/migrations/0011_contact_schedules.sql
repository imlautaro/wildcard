CREATE TABLE contact_schedule (
  id TEXT PRIMARY KEY NOT NULL,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  instruction TEXT NOT NULL CHECK (length(instruction) BETWEEN 1 AND 1000),
  time_zone TEXT NOT NULL,
  next_at INTEGER NOT NULL,
  interval_seconds INTEGER CHECK (interval_seconds BETWEEN 600 AND 2592000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  last_mutation TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (contact_id, user_id) REFERENCES contact(id, user_id) ON DELETE CASCADE
);
CREATE INDEX contact_schedule_due_idx ON contact_schedule(status, next_at);
CREATE INDEX contact_schedule_owner_idx ON contact_schedule(user_id, status);
CREATE INDEX contact_schedule_contact_idx ON contact_schedule(contact_id, user_id, created_at);

ALTER TABLE chat_turn ADD COLUMN time_zone TEXT;
ALTER TABLE chat_turn ADD COLUMN schedule_id TEXT REFERENCES contact_schedule(id);
ALTER TABLE chat_turn ADD COLUMN schedule_revision INTEGER;
ALTER TABLE chat_turn ADD COLUMN scheduled_at INTEGER;
ALTER TABLE chat_turn ADD COLUMN schedule_instruction TEXT;
CREATE UNIQUE INDEX chat_schedule_occurrence_idx ON chat_turn(schedule_id, schedule_revision, scheduled_at)
  WHERE schedule_id IS NOT NULL;
CREATE INDEX chat_schedule_idx ON chat_turn(schedule_id);

-- Advance the cursor in the same transaction that creates the durable outbox job.
CREATE TRIGGER chat_schedule_advance AFTER INSERT ON chat_turn WHEN NEW.schedule_id IS NOT NULL BEGIN
  UPDATE contact_schedule SET
    status = CASE WHEN interval_seconds IS NULL THEN 'completed' ELSE 'active' END,
    next_at = CASE WHEN interval_seconds IS NULL THEN next_at
      ELSE NEW.scheduled_at + interval_seconds * 1000 END,
    updated_at = NEW.created_at
    WHERE id = NEW.schedule_id AND revision = NEW.schedule_revision AND status = 'active';
END;

-- A cancellation or edit invalidates queued/running work and unsent alerts.
CREATE TRIGGER contact_schedule_invalidate AFTER UPDATE OF revision, status ON contact_schedule
WHEN NEW.revision != OLD.revision OR NEW.status = 'cancelled' BEGIN
  UPDATE chat_turn SET status = 'failed', error_code = 'SCHEDULE_CANCELLED', updated_at = NEW.updated_at
    WHERE schedule_id = NEW.id AND status IN ('queued', 'running');
  DELETE FROM push_delivery WHERE turn_id IN (SELECT id FROM chat_turn WHERE schedule_id = NEW.id);
END;

-- Tool receipts make side effects repeatable across model/Workflow retries.
CREATE TABLE schedule_mutation (
  id TEXT PRIMARY KEY NOT NULL,
  turn_id TEXT NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  request TEXT NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL
);
