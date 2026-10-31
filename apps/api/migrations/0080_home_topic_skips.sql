-- Updates: a contact may skip a card when it has nothing honest to show. The
-- topic remembers consecutive skips and the last reason so the editor can
-- reassign, reformulate or drop it; curator topics retire after three in a row
-- (docs/updates.md#skipped-topics). A published card resets both.
ALTER TABLE home_topic ADD COLUMN skips INTEGER NOT NULL DEFAULT 0 CHECK (skips >= 0);
ALTER TABLE home_topic ADD COLUMN skip_reason TEXT CHECK (skip_reason IS NULL OR length(skip_reason) <= 200);
