-- Topic variety for spontaneous messages (docs/initiative.md#topic-variety).
-- Each published proactive message records one coarse subject category chosen by the
-- planner from a fixed list, never free text. Other contacts' planners for the same
-- person read only these labels from the last 48 hours to avoid opening the same
-- subject. NULL on human turns, welcomes and messages published before this migration.
ALTER TABLE chat_turn ADD COLUMN initiative_topic TEXT CHECK (initiative_topic IS NULL OR initiative_topic IN (
  'music', 'film-tv', 'books', 'games', 'technology', 'science', 'food', 'sports', 'art-design',
  'places-culture', 'ideas', 'humor', 'everyday', 'follow-up', 'other'));
