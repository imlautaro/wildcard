-- Record tool execution before dispatch so response coalescing cannot hide actions.
ALTER TABLE chat_turn ADD COLUMN tools_started INTEGER NOT NULL DEFAULT 0 CHECK (tools_started IN (0, 1));
-- Older in-flight/retried jobs may already have issued tools without this marker.
UPDATE chat_turn SET tools_started = 1 WHERE status = 'running' OR attempt > 1;
