-- Saved per-app state for local mini app actions (counters, toggles, notes).
-- `last_execution` lets the action ledger commit in the same transaction as the swap.
CREATE TABLE mini_app_state (
  app_id TEXT PRIMARY KEY REFERENCES mini_app(id) ON DELETE CASCADE,
  values_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  last_execution TEXT,
  updated_at INTEGER NOT NULL
);
