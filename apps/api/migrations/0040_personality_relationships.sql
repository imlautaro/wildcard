-- Relationship continuity projects published observations by stable participant
-- identity. Source references remain internal, so revocation/deletion can remove
-- their influence without copying private causes into a shared summary.
CREATE INDEX personality_relationship_idx
  ON personality_event(agent_id, speaker_id, created_at DESC, source_id);

-- A new acting plan must not reuse the old classifier's weaker attribution.
-- Existing observations remain stored until expiry; no old transcript is read
-- or retrospectively classified to populate the new relationship model.
