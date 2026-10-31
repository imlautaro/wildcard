-- When the person last opened Updates. Cards generated after it are "new" and
-- drive the Updates badge on iOS and web (docs/updates.md#new-card-badge).
-- NULL (existing feeds) falls back to viewed_at.
ALTER TABLE home_feed ADD COLUMN seen_at INTEGER;
