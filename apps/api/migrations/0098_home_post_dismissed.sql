-- Dismissed For you posts (docs/updates.md#less-like-this). After "Less like this" the
-- post becomes a short notice whose X hides that one post for good, on every client,
-- without hiding its topic. NULL for posts the person kept.
ALTER TABLE home_post ADD COLUMN dismissed_at INTEGER;
