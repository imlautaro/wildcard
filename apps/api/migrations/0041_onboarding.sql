-- Existing accounts keep their current experience. Only future accounts enroll.
ALTER TABLE user ADD COLUMN onboarding_required INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_required IN (0, 1));
UPDATE user SET onboarding_required = 0;
CREATE TABLE account_onboarding (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  plan_json TEXT CHECK (plan_json IS NULL OR json_valid(plan_json)),
  status TEXT NOT NULL CHECK (status IN ('queued', 'generating', 'failed', 'complete')),
  photo_count INTEGER NOT NULL DEFAULT 0 CHECK (photo_count BETWEEN 0 AND 5),
  group_id TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX onboarding_pending_idx ON account_onboarding(status, updated_at);
