import type { Sticker } from './types';

// Helpers for stickers (docs/stickers.md#web). Sticker bytes load through the private image
// cache, so the path carries the digest: the cache key (account + path) then changes
// whenever the bytes could.
export const stickerImagePath = (sticker: Pick<Sticker, 'id' | 'digest'>) => `stickers/${sticker.id}/image?v=${sticker.digest}`;
export const contactStickerImagePath = (contactID: string, sticker: Pick<Sticker, 'id' | 'digest'>) =>
  `contacts/${contactID}/stickers/${sticker.id}/image?v=${sticker.digest}`;

const longEdge = 1536;
const sourceLimit = 5 * 1024 * 1024 - 64 * 1024;

// Same rule as the API's `validStickerEmoji`: one grapheme that is a pictograph, flag or keycap.
const emojiShape = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]️?⃣)/u;
export function isSingleEmoji(value: string): boolean {
  if (!value || value.length > 32) return false;
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length === 1 && emojiShape.test(value);
}

export const stickerEmojis = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😏', '😉', '🙂', '🙃', '😅', '😭',
  '😢', '😡', '🤬', '😱', '😴', '🤔', '🙄', '😬', '🤗', '🤭', '😇', '🤪', '😜', '🥺', '😤', '🤯',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '👋', '🤝', '✌️', '🤞', '👀', '🫶', '❤️', '💔', '🔥', '✨',
  '🎉', '🎂', '🎁', '💯', '💩', '👻', '🐶', '🐱', '🍕', '🍔', '☕', '🍻', '⚽', '🚀', '🌈', '🌙',
];

// Decode the chosen image, apply its EXIF orientation, downscale to at most 1536 px on the long
// edge, flatten transparency on white and encode a JPEG under the cutout's 5 MB limit.
// The decoded bitmap is closed before returning; nothing is kept besides the returned blob.
export async function stickerSourceJPEG(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error(translate('chat.image.chooseImage'));
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error(translate('chat.image.unreadable'));
  });
  try {
    if (Math.min(bitmap.width, bitmap.height) < 64) throw new Error(translate('chat.image.tooSmall'));
    const factor = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * factor));
    const height = Math.max(1, Math.round(bitmap.height * factor));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(translate('chat.image.editingUnavailable'));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.type === 'image/jpeg' && blob.size <= sourceLimit) return blob;
    }
    throw new Error(translate('chat.image.tooLarge'));
  } finally { bitmap.close(); }
}
