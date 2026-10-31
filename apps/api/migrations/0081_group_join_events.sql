-- Membership banners, per-member past-history access and a debounced welcome round.
-- See docs/groups.md#join-banners-and-welcomes.

-- Membership notices live in the shared history so every client orders them by
-- sequence. They have no user or agent sender; requester_id is the human whose
-- action produced them (the adder, or the invitee who accepted).
ALTER TABLE group_message ADD COLUMN event_json TEXT CHECK (event_json IS NULL OR json_valid(event_json));

-- NULL keeps the previous behavior: the member reads the whole history. Otherwise
-- the member reads only messages whose sequence is at least this value (its own
-- join notice). Existing memberships keep full access.
ALTER TABLE group_member ADD COLUMN history_start INTEGER;
ALTER TABLE group_agent ADD COLUMN history_start INTEGER;
-- The inviter's choice travels with the invitation until it is accepted.
ALTER TABLE group_invite ADD COLUMN include_history INTEGER NOT NULL DEFAULT 1 CHECK (include_history IN (0, 1));

-- One pending welcome per group. Each new join pushes due_at forward, so adding
-- several members in a row produces one welcome for all of them.
CREATE TABLE group_welcome (
  group_id TEXT PRIMARY KEY NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  first_sequence INTEGER NOT NULL,
  due_at INTEGER NOT NULL
);
CREATE INDEX group_welcome_due_idx ON group_welcome(due_at);
