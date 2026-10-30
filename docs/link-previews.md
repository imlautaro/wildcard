# Link previews

Messages with a link show a card with the page's site name, title, description and
image, like other messaging apps. Both iOS and web implement it with matching rules.

## Which link gets a card

One card per bubble, under the text:

- People's messages: the first `http(s)` link (scheme or `www.` host, the same
  detection that makes links clickable; see [bot message Markdown](chats.md#bot-message-markdown)).
- Contact messages: only when the message contains exactly one distinct link, so
  research replies with several sources do not show a card for an arbitrary one.

Other links stay clickable. Captions under images and voice messages get no card.
Nothing renders until a ready preview exists; a failed or blocked page simply shows
no card.

## Fetching (API)

`GET /api/v1/link-previews?url=<url>` (bearer session) returns
`{ preview: { url, hash, status, title, description, siteName, imageVersion } }`.
`GET /api/v1/link-previews/<hash>/image` returns the stored image.

- The URL must be a credential-free public `http(s)` domain URL (same validation as
  research sources); the fragment is dropped and the SHA-256 of the URL is the key.
- The Worker fetches the page with the strictly-public fetch flag, following at
  most three redirects, each validated again, 8-second timeout, and reads only the
  document head (at most 512 KiB). It extracts Open Graph, Twitter card and HTML
  fallbacks. Pages without metadata may advertise an oEmbed document, which is
  used instead; YouTube and Vimeo are asked through their official oEmbed endpoints.
  Sites that refuse automated clients (for example some news sites) get no card;
  the Worker identifies itself honestly and does not impersonate other crawlers.
- The image (JPEG, PNG, WebP or GIF, recognized by its bytes, at most 3 MiB) is
  copied to the existing R2 bucket at `link-previews/<hash>`; clients never contact
  the linked site, so it does not see readers' IP addresses.
- Previews are shared across accounts: they hold only what any visitor of the URL
  sees. Ready previews live seven days, failed ones six hours; the minute Cron
  deletes expired rows and their images (up to 50 per run). A refresh racing with
  expiry can lose the image until the next refresh.
- Budgets per account: 600 reads and 30 uncached fetches per minute.

## Client caches

Web (`useLinkPreviews`) and iOS (`LinkPreviewCache`, owned by `PrivateImageCache`)
keep a memory-only, account-keyed session cache of at most 200 previews. Requests
for the same URL are shared; a server `failed` result is remembered for the session
(no card) and transport failures are retried when the bubble renders again. Late
responses after a sign-out or account switch are discarded, and both caches are
dropped on every session reset. Images use the existing private image caches
(web memory blob cache; iOS `PrivateImageCache`, resource `link/<hash>/<version>`,
with its protected disk cache) keyed by the preview's fetch time as version.

## Verification

Static checks: API, web and iOS type checks; the migration and every new statement
prepared with `EXPLAIN` on local workerd D1; live extraction for USCIS, GitHub,
Wikipedia, example.com and YouTube (oEmbed). Device rendering, card layout in long
bubbles, dark mode and offline behavior still need checking on both clients.
