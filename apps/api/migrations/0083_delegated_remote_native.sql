-- Delegation is explicit, participant-specific and subordinate to an iPhone grant.
CREATE TABLE native_remote_delegate (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  owner_contact_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(device_id, owner_contact_id) REFERENCES native_remote_grant(device_id, contact_id) ON DELETE CASCADE,
  UNIQUE(device_id, contact_id)
);
CREATE INDEX native_remote_delegate_contact ON native_remote_delegate(contact_id);
ALTER TABLE native_action ADD COLUMN remote_grant_id TEXT;

-- Resolve every access through current membership and the device owner's grant.
CREATE VIEW native_remote_access AS
SELECT g.device_id, g.contact_id, g.contact_id AS owner_contact_id, g.kinds_json,
  g.device_id || ':' || g.contact_id AS grant_id
FROM native_remote_grant g JOIN native_remote_device d ON d.id = g.device_id
JOIN contact c ON c.id = g.contact_id AND c.user_id = d.user_id
UNION ALL
SELECT x.device_id, x.contact_id, x.owner_contact_id, g.kinds_json, x.id AS grant_id
FROM native_remote_delegate x
JOIN native_remote_grant g ON g.device_id = x.device_id AND g.contact_id = x.owner_contact_id
JOIN native_remote_device d ON d.id = g.device_id
JOIN contact owner ON owner.id = x.owner_contact_id AND owner.user_id = d.user_id
JOIN contact recipient ON recipient.id = x.contact_id AND recipient.agent_id = owner.agent_id AND recipient.user_id != owner.user_id;
