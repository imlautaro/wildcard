-- Private generation jobs reuse the onboarding Workflow and existing R2 bucket.
CREATE TABLE contact_generation (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  plan_json TEXT CHECK (plan_json IS NULL OR json_valid(plan_json)),
  status TEXT NOT NULL CHECK (status IN ('queued', 'generating', 'failed', 'complete')),
  contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX contact_generation_pending ON contact_generation(status, updated_at);
CREATE INDEX contact_generation_owner ON contact_generation(user_id, updated_at DESC);
CREATE UNIQUE INDEX contact_generation_active ON contact_generation(user_id) WHERE status IN ('queued', 'generating', 'failed');
