-- Scheduled private messages to another participant of the same shared contact.
-- See docs/schedules.md#messages-for-another-participant.
--
-- NULL keeps the existing behavior: the contact writes to the schedule owner.
-- A recipient makes the instruction the exact text delivered, at the scheduled
-- time, into that participant's private chat with the same shared contact.
--
-- No foreign key: a cascade would delete schedules that the owner's dispatched
-- turns still reference (chat_turn.schedule_id), which blocks the deletion. The
-- triggers below cancel instead, so a schedule never falls back to a message for
-- its owner and stops before its next occurrence.
ALTER TABLE contact_schedule ADD COLUMN recipient_user_id TEXT;
CREATE INDEX contact_schedule_recipient_idx ON contact_schedule(recipient_user_id) WHERE recipient_user_id IS NOT NULL;

-- The recipient leaves, is removed from, or deletes the shared contact (also
-- reached through account deletion, which cascades their contacts).
CREATE TRIGGER cancel_private_schedules_contact BEFORE DELETE ON contact BEGIN
  UPDATE contact_schedule SET status = 'cancelled', updated_at = unixepoch() * 1000
    WHERE status = 'active' AND recipient_user_id = OLD.user_id
      AND contact_id IN (SELECT id FROM contact WHERE agent_id = OLD.agent_id);
END;
CREATE TRIGGER cancel_private_schedules_user BEFORE DELETE ON user BEGIN
  UPDATE contact_schedule SET status = 'cancelled', updated_at = unixepoch() * 1000
    WHERE status = 'active' AND recipient_user_id = OLD.id;
END;
