-- For you content (docs/updates.md#posts, #topics-to-follow).
-- A post may quote another contact's recent post, like a quote post on X; the quoted
-- post keeps its own lifetime, so the link is cleared when it is deleted.
ALTER TABLE home_post ADD COLUMN quote_of TEXT REFERENCES home_post(id) ON DELETE SET NULL;
-- Topics the editor considered but did not schedule, offered on wide web screens as
-- "Topics to follow": a JSON array of {title, reason}, replaced by every plan.
ALTER TABLE home_feed ADD COLUMN suggestions_json TEXT
  CHECK (suggestions_json IS NULL OR (json_valid(suggestions_json) AND length(suggestions_json) <= 4000));
