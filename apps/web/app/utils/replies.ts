import { plainMessageMarkdown } from './messageMarkdown';
import type { Attachment, ReplyQuote } from './types';

// A quote plus the author label and accent shown by the current conversation.
export type ReplyPreview = { quote: ReplyQuote; author: string; color: { light: string; dark: string } };
export const ownReplyColor = { light: 'var(--accent)', dark: 'var(--accent)' };

// Local quote for the composer and the pending bubble, clipped like the server's.
export function localReplyQuote(messageID: string, side: ReplyQuote['side'], text: string, attachment: Attachment | null,
  sender: { userID?: string | null; agentID?: string | null; senderName?: string | null } = {}): ReplyQuote {
  const characters = [...text];
  const previewSource = side === 'assistant' || sender.agentID ? plainMessageMarkdown(text) : text;
  const previewCharacters = [...previewSource];
  return {
    messageID, side, available: true, userID: sender.userID ?? null, agentID: sender.agentID ?? null, senderName: sender.senderName ?? null,
    previewText: previewCharacters.length > 200 ? `${previewCharacters.slice(0, 200).join('')}…` : previewSource,
    text: characters.length > 200 ? `${characters.slice(0, 200).join('')}…` : text, attachment,
  };
}

export function replyColor(groupID: string, identity: string) {
  const style = senderColor(groupID, identity);
  return { light: style['--sender-light'], dark: style['--sender-dark'] };
}

export function quoteSummary(quote: ReplyQuote) {
  if (!quote.available) return 'Original message unavailable';
  if (quote.text) return quote.previewText ?? (quote.side === 'assistant' || quote.agentID ? plainMessageMarkdown(quote.text) : quote.text);
  // Quotes of voice messages carry no text or attachment (docs/voice.md).
  if (!quote.attachment) return 'Voice message';
  if (quote.attachment.sticker) return `Sticker ${quote.attachment.sticker.emoji}`;
  return quote.attachment.mimeType.startsWith('image/') ? 'Photo' : quote.attachment.name;
}
