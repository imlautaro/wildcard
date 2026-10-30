-- One coordinator decision per group trigger: which contacts speak, in what
-- order and with which angle. Unselected reply slots finish without inference.
CREATE TABLE group_round (
  source_id TEXT PRIMARY KEY NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  claimed_by TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'planned', 'failed')),
  plan_json TEXT,
  planned_at INTEGER
);
CREATE INDEX group_round_group_idx ON group_round(group_id, claimed_at);

-- Planned slots: rank orders publication; a ready draft is visible to later
-- ranks of the same round so they build on it instead of repeating it.
ALTER TABLE group_reply ADD COLUMN plan_rank INTEGER;
ALTER TABLE group_reply ADD COLUMN plan_role TEXT;
ALTER TABLE group_reply ADD COLUMN plan_angle TEXT;
ALTER TABLE group_reply ADD COLUMN plan_tools INTEGER NOT NULL DEFAULT 1 CHECK (plan_tools IN (0, 1));
ALTER TABLE group_reply ADD COLUMN draft_json TEXT;
ALTER TABLE group_reply ADD COLUMN draft_ready_at INTEGER;

-- Researching overlays online/typing like recording does; it is bounded.
ALTER TABLE agent_presence ADD COLUMN researching_until INTEGER;
ALTER TABLE agent_presence ADD COLUMN researching_topic TEXT;
