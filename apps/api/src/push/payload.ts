import { plainMessageMarkdown } from '../../../../shared/messageMarkdown';
type ReplyAlert = {
  contactName: string;
  reply: string;
  contactID: string;
  userID: string;
  turnID: string;
  unreadCount: number;
  photoURL?: string;
};

export function replyPayload(alert: ReplyAlert): string {
  const serialize = (body: string) => JSON.stringify({
    aps: {
      alert: { title: alert.contactName, body }, sound: 'mixkit-flute-mobile-phone-notification-alert-2316.wav', badge: alert.unreadCount,
      'thread-id': alert.contactID, 'mutable-content': 1,
    },
    contactID: alert.contactID, userID: alert.userID, turnID: alert.turnID, photoURL: alert.photoURL,
  });
  return boundedPayload(plainMessageMarkdown(alert.reply), serialize);
}

export function groupMessagePayload(alert: { groupID: string; groupName: string; userID: string;
  messageID: string; senderName: string; text: string; agentID?: string | null; sentAt: number; sequence: number; unreadCount: number }): string {
  return boundedPayload(alert.agentID ? plainMessageMarkdown(alert.text) : alert.text, (body) => JSON.stringify({
    aps: { alert: { title: Array.from(alert.groupName).slice(0, 100).join(''), subtitle: Array.from(alert.senderName).slice(0, 100).join(''), body },
      sound: 'mixkit-flute-mobile-phone-notification-alert-2316.wav', badge: alert.unreadCount,
      'thread-id': `group-${alert.groupID}` },
    groupID: alert.groupID, userID: alert.userID, messageID: alert.messageID, sentAt: alert.sentAt, sequence: alert.sequence,
  }));
}

// Browser notifications carry no sound or badge; the service worker shows them.
// `unread` is the account-wide total so an open tab can refresh its title.
export function replyWebPayload(alert: ReplyAlert): string {
  return boundedPayload(plainMessageMarkdown(alert.reply), (body) => JSON.stringify({
    title: Array.from(alert.contactName).slice(0, 100).join(''), body, tag: `contact-${alert.contactID}`,
    url: `/chats/${alert.contactID}`, unread: alert.unreadCount,
  }), 3000);
}

export function groupWebPayload(alert: { groupID: string; groupName: string; senderName: string; text: string;
  agentID?: string | null; unreadCount: number }): string {
  return boundedPayload(alert.agentID ? plainMessageMarkdown(alert.text) : alert.text, (body) => JSON.stringify({
    title: Array.from(alert.groupName).slice(0, 100).join(''), subtitle: Array.from(alert.senderName).slice(0, 100).join(''), body,
    tag: `group-${alert.groupID}`, url: `/groups/${alert.groupID}`, unread: alert.unreadCount,
  }), 3000);
}

function boundedPayload(text: string, serialize: (body: string) => string, limit = 4096): string {
  const full = serialize(text);
  if (new TextEncoder().encode(full).byteLength <= limit) return full;
  // Measure serialized UTF-8, including JSON escapes, without splitting Unicode scalars.
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = serialize(`${characters.slice(0, middle).join('')}…`);
    if (new TextEncoder().encode(candidate).byteLength <= limit) low = middle;
    else high = middle - 1;
  }
  return serialize(`${characters.slice(0, low).join('')}…`);
}
