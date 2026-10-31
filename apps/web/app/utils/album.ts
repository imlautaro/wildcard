// Contact-generated albums (docs/generated-images.md#albums): the first image keeps
// the message's attachment path; later images add `image=N`. Shared by chat bubbles
// and chat-details media so both use the same private image cache keys.
export function albumImagePath(path: string, image?: number | null) {
  return image ? `${path}${path.includes('?') ? '&' : '?'}image=${image}` : path;
}
