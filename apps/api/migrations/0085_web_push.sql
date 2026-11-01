-- Browser Web Push subscriptions reuse push_device so every existing fan-out
-- (reply and group deliveries) already includes them. The device token is the
-- SHA-256 hex digest of the endpoint; this table holds what is needed to encrypt
-- to the browser. Deleting the device (sign-out, expiry, 404/410) removes it.
CREATE TABLE web_push_subscription (
  device_id TEXT PRIMARY KEY NOT NULL REFERENCES push_device(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
