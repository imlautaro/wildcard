type ReplyAlert = {
  contactName: string;
  reply: string;
  contactID: string;
  userID: string;
  unreadCount: number;
  photoURL?: string;
};

export function replyPayload(alert: ReplyAlert): string {
  const serialize = (body: string) => JSON.stringify({
    aps: {
      alert: { title: alert.contactName, body }, sound: 'default', badge: alert.unreadCount,
      'thread-id': alert.contactID, 'mutable-content': 1,
    },
    contactID: alert.contactID, userID: alert.userID, photoURL: alert.photoURL,
  });
  const full = serialize(alert.reply);
  if (new TextEncoder().encode(full).byteLength <= 4096) return full;
  // Measure serialized UTF-8, including JSON escapes, without splitting Unicode scalars.
  const characters = Array.from(alert.reply);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = serialize(`${characters.slice(0, middle).join('')}…`);
    if (new TextEncoder().encode(candidate).byteLength <= 4096) low = middle;
    else high = middle - 1;
  }
  return serialize(`${characters.slice(0, low).join('')}…`);
}
