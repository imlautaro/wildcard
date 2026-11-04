-- Early-access waitlist (docs/authentication.md#early-access-waitlist). While a super
-- admin has closed registration, iOS and web offer this form instead of sign-up.
-- One row per email (case-insensitive); joining again updates the row. No IP or
-- user agent is stored. Super admins read and remove entries in apps/admin.
CREATE TABLE waitlist_entry (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'web', 'both')),
  note TEXT,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX waitlist_entry_created_idx ON waitlist_entry (created_at DESC, id DESC);
