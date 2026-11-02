import type { DraftAttachment } from './types';

export const attachmentTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/markdown', '.md', '.markdown'];
const attachmentLimit = 5 * 1024 * 1024;
const photoLimit = 500 * 1024;

export function base64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

// The API validates magic bytes and accepts these formats up to 5 MB.
export async function draftAttachment(file: File): Promise<DraftAttachment> {
  const markdown = /\.(md|markdown)$/i.test(file.name);
  const mimeType = markdown ? 'text/markdown' : file.type;
  if (!attachmentTypes.includes(mimeType)) throw new Error(translate('chat.files.unsupported'));
  if (!file.size || file.size > attachmentLimit) throw new Error(translate('chat.files.tooLarge'));
  const name = (file.name || 'attachment').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180);
  const data = base64(new Uint8Array(await file.arrayBuffer()));
  const previewURL = mimeType.startsWith('image/') ? URL.createObjectURL(file) : null;
  return { name, mimeType, size: file.size, data, previewURL };
}

// Apply EXIF orientation and bound the in-memory editor source, as on iOS.
export async function photoCropSource(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith('image/')) throw new Error(translate('chat.image.chooseImage'));
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error(translate('chat.image.unreadable'));
  });
  if (Math.min(bitmap.width, bitmap.height) < 64) {
    bitmap.close();
    throw new Error(translate('chat.image.tooSmall'));
  }
  const factor = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  if (factor === 1) return bitmap;
  try {
    return await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * factor)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * factor)),
      resizeQuality: 'high',
    });
  } finally { bitmap.close(); }
}

// Re-encode only the confirmed square, without copying source metadata.
export async function croppedJPEG(bitmap: ImageBitmap, x: number, y: number, side: number): Promise<Blob> {
  const tolerance = 1e-6;
  if (![x, y, side].every(Number.isFinite) || side <= 0 || x < -tolerance || y < -tolerance
    || x + side > bitmap.width + tolerance || y + side > bitmap.height + tolerance) throw new Error(translate('chat.files.cropInvalid'));
  // Clamp floating-point drift at the source edges.
  x = Math.max(0, Math.min(bitmap.width - side, x));
  y = Math.max(0, Math.min(bitmap.height - side, y));
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(translate('chat.files.photoEditingUnavailable'));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, x, y, side, side, 0, 0, size, size);
  for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= photoLimit) return blob;
  }
  throw new Error(translate('chat.image.tooLarge'));
}
