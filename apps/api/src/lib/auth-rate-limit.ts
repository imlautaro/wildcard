export async function admitAuthRequest(db: D1Database, ip: string, path: string, max: number) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / 60);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${path}:${bucket}`));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const result = await db.batch<{ count: number }>([
    db.prepare('DELETE FROM auth_rate_limit WHERE key IN (SELECT key FROM auth_rate_limit WHERE expires_at <= ? LIMIT 50)').bind(now),
    db.prepare(`INSERT INTO auth_rate_limit (key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, (bucket + 1) * 60),
  ]);
  const count = result[1]?.results[0]?.count;
  if (typeof count !== 'number') throw new Error('Auth admission failed.');
  return { allowed: count <= max, retryAfter: (bucket + 1) * 60 - now };
}
