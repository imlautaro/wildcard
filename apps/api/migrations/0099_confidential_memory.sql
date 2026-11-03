-- Facts a person shared in confidence (a surprise, a gift, "don't tell X", a complaint
-- about another participant) stay in the chat they were told in: never other participants
-- of a shared contact, groups or pooled contacts (docs/privacy.md#discretion).
ALTER TABLE contact_memory ADD COLUMN confidential INTEGER NOT NULL DEFAULT 0 CHECK (confidential IN (0, 1));
ALTER TABLE retained_contact_memory ADD COLUMN confidential INTEGER NOT NULL DEFAULT 0 CHECK (confidential IN (0, 1));
