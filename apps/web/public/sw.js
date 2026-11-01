// Wildcard service worker: browser Web Push only. It caches nothing and never
// intercepts fetches. A push shows a notification and tells open tabs to refresh
// their chat lists so the tab title's unread count stays current.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Show the generic alert below. */ }
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'wildcard-push', unread: data.unread });
    // Every push shows a notification: Safari revokes subscriptions that stay silent.
    // The server already skips chats the person has open (chat_visit).
    await self.registration.showNotification(data.title || 'Wildcard', {
      body: data.subtitle && data.body ? `${data.subtitle}: ${data.body}` : data.body || '',
      tag: data.tag, renotify: !!data.tag, data: { url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'wildcard-open', url });
    } else {
      await self.clients.openWindow(url);
    }
  })());
});
