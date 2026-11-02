// The API words a few chat-list previews itself, in English, inside the same
// lastMessageText / lastMessagePreview column as real message text (see
// apps/api/src/routes/contacts.ts and groups/routes.ts). Clients translate exactly
// those fixed labels at display time and pass anything else through unchanged.
// Text a person literally typed that equals one of these labels is also shown
// translated, which only affects the list preview. docs/localization.md.
export function localizeServerPreview(text: string): string {
  if (text === 'Voice message') return translate('chat.preview.voiceMessage');
  if (text === 'Scheduled message') return translate('chat.preview.scheduled');
  if (text === 'Group response') return translate('chat.preview.groupResponse');
  if (text === 'Working on a task') return translate('chat.preview.workingOnTask');
  const photos = /^(\d+) photos$/.exec(text);
  if (photos) return translate('chat.preview.photos', Number(photos[1]));
  if (text.startsWith('Sticker ') && !/\s/u.test(text.slice(8))) return translate('chat.preview.sticker', { emoji: text.slice(8) });
  if (text.startsWith('Attachment: ')) return translate('chat.preview.attachment', { name: text.slice(12) });
  return text;
}
