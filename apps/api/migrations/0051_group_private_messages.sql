-- A contact in a group can write to one human member privately, in that person's
-- existing private chat. The turn is assistant-only and marks the group it came
-- from, so a daily budget can count these messages separately from initiative.
ALTER TABLE chat_turn ADD COLUMN origin_group_id TEXT REFERENCES chat_group(id) ON DELETE SET NULL;
CREATE INDEX group_private_message_budget_idx ON chat_turn(user_id, updated_at) WHERE origin_group_id IS NOT NULL;
