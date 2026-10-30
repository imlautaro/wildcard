-- Public page metadata for link cards, shared across accounts: a preview holds
-- only what any visitor of the URL sees. The image is copied to R2 at
-- `link-previews/<url_hash>` so clients never contact the linked site.
CREATE TABLE link_preview (
  url_hash TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  title TEXT CHECK (title IS NULL OR length(title) <= 300),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  site_name TEXT CHECK (site_name IS NULL OR length(site_name) <= 120),
  image_type TEXT CHECK (image_type IS NULL OR image_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX link_preview_expiry ON link_preview(expires_at);
