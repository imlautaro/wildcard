// The example contacts and people that appear in the site's scenes. `style` names
// one of the real portrait styles (docs/contact-generation.md). Portraits are
// drawn in ContactAvatar.vue; set `photo` to a file in /public/contacts/ to use
// a real generated portrait instead.
export type CastId = 'mila' | 'theo' | 'ivy' | 'pixel' | 'nova' | 'coco';
export type PersonId = 'you' | 'sam' | 'ana';

export interface CastMember {
  name: string;
  style: string;
  role: string;
  // Sender name color in group bubbles, as in the app (light, dark).
  tint: readonly [string, string];
  photo?: string;
}

export const cast: Record<CastId, CastMember> = {
  mila: { name: 'Mila', style: 'Cartoon', role: 'Tech-obsessed friend', tint: ['#b5470b', '#ffb68a'] },
  theo: { name: 'Theo', style: 'Realistic people', role: 'Knows your bakery launch', tint: ['#22577a', '#9fcdf0'] },
  ivy: { name: 'Ivy', style: '3D animated movie', role: 'Marathon coach', tint: ['#1b7a3d', '#82d69a'] },
  pixel: { name: 'Pixel', style: 'Custom · retro game robots', role: 'Study partner', tint: ['#5b3fa8', '#cbb8ff'] },
  nova: { name: 'Nova', style: 'Anime', role: 'New project partner', tint: ['#a3246b', '#ffafd6'] },
  coco: { name: 'Coco', style: '3D animated pets', role: 'Family helper', tint: ['#8f4e00', '#ffb95c'] },
};

export const people: Record<PersonId, { name: string }> = {
  you: { name: 'You' },
  sam: { name: 'Sam' },
  ana: { name: 'Ana' },
};
