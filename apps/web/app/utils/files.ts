import type { DraftAttachment } from './types';

export const attachmentTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const attachmentLimit = 5 * 1024 * 1024;
const photoLimit = 500 * 1024;

function base64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

// The API validates magic bytes and accepts these formats up to 5 MB.
export async function draftAttachment(file: File): Promise<DraftAttachment> {
  if (!attachmentTypes.includes(file.type)) throw new Error('Choose a JPEG, PNG, GIF, WebP, or PDF.');
  if (file.size > attachmentLimit) throw new Error('Choose a file up to 5 MB.');
  const name = (file.name || 'attachment').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180);
  const data = base64(new Uint8Array(await file.arrayBuffer()));
  const previewURL = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
  return { name, mimeType: file.type, size: file.size, data, previewURL };
}

// Profile photos must be square JPEGs between 64 and 1024 pixels and under 512 KB.
// Center-crop to 512 px; browsers encode baseline JPEG, which the API accepts.
export async function squareJPEG(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('This image could not be read. Choose a JPEG, PNG, or WebP photo.');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  if (side < 64) throw new Error('Choose a photo at least 64 pixels wide.');
  const size = Math.min(512, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo editing is unavailable in this browser.');
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= photoLimit) return blob;
  }
  throw new Error('Choose a smaller photo.');
}
