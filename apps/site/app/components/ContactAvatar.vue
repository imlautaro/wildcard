<script setup lang="ts">
// A contact's portrait in the app's round `.avatar`. The site draws one small SVG
// illustration per example contact, each hinting at a real portrait style
// (utils/cast.ts); a `photo` on the cast member replaces it with a real image.
// `person` renders a human participant's initials instead, as the app does.
const props = withDefaults(defineProps<{ who?: CastId; person?: PersonId; size?: number }>(), { size: 40, who: undefined, person: undefined });
const uid = useId();
const id = (name: string) => `${uid}-${name}`;
const url = (name: string) => `url(#${id(name)})`;
const member = computed(() => (props.who ? cast[props.who] : undefined));
const initials = computed(() => (props.person ? people[props.person].name.slice(0, 1) : ''));

// Pixel's 16 × 16 sprite: one character per pixel.
const sprite = [
  '................',
  '.......y........',
  '.......g........',
  '...oooooooooo...',
  '...osssssssso...',
  '...osccssccso...',
  '...osccssccso...',
  '...osssssssso...',
  '...osdldldlso...',
  '...osssssssso...',
  '...oooooooooo...',
  '.......dd.......',
  '..pppppppppppp..',
  '..ppqqqrrqqqpp..',
  '..ppqqqrrqqqpp..',
  '..pppppppppppp..',
];
const spriteColors: Record<string, string> = {
  y: '#ffd23f', g: '#8a93a3', o: '#5c6472', s: '#c3cad6', c: '#3ff2ff', d: '#2e3340', l: '#8a93a3',
  p: '#6c5ce7', q: '#8577f0', r: '#ff4d6d',
};
const pixels = computed(() => sprite.flatMap((row, y) => [...row].flatMap((key, x) => {
  const fill = spriteColors[key];
  return fill ? [{ x, y, fill, eye: key === 'c' }] : [];
})));
</script>

<template>
  <span v-if="person" class="avatar person" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }" aria-hidden="true">{{ initials }}</span>
  <span v-else class="avatar contact-avatar" :style="{ width: `${size}px`, height: `${size}px` }" :title="member?.name" aria-hidden="true">
    <img v-if="member?.photo" :src="member.photo" alt="">
    <svg v-else-if="who === 'mila'" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#ffd66b" />
      <ellipse cx="32" cy="31" rx="19.5" ry="20" fill="#4a2c1d" />
      <rect x="27.5" y="40" width="9" height="10" fill="#e9a77f" />
      <path d="M9 64c2-12 12-17 23-17s21 5 23 17z" fill="#3d7bd9" />
      <ellipse cx="32" cy="31" rx="13" ry="14" fill="#f7c39b" />
      <path d="M17.5 30c0-11 7.5-17.5 15.5-17.5 8.5 0 14 7 13.5 16-5-5-12-6.5-19.5-5-4 .9-7.4 3.2-9.5 6.5z" fill="#4a2c1d" />
      <circle cx="27" cy="32.5" r="1.9" fill="#2b1a12" />
      <circle cx="37" cy="32.5" r="1.9" fill="#2b1a12" />
      <circle cx="23.5" cy="36.5" r="2.5" fill="#f08a7a" opacity="0.55" />
      <circle cx="40.5" cy="36.5" r="2.5" fill="#f08a7a" opacity="0.55" />
      <path d="M28.2 37.6q3.8 3.2 7.6 0" fill="none" stroke="#2b1a12" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <svg v-else-if="who === 'theo'" viewBox="0 0 64 64">
      <defs>
        <linearGradient :id="id('bg')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4dce3" /><stop offset="1" stop-color="#8797a8" /></linearGradient>
        <radialGradient :id="id('skin')" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#e7b896" /><stop offset="1" stop-color="#b07253" /></radialGradient>
        <linearGradient :id="id('coat')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4b66" /><stop offset="1" stop-color="#1c2638" /></linearGradient>
      </defs>
      <rect width="64" height="64" :fill="url('bg')" />
      <path d="M5 64c2-13 14-18.5 27-18.5S57 51 59 64z" :fill="url('coat')" />
      <path d="M26 41h12l1 7c-2.5 2.3-11.5 2.3-14 0z" fill="#a8694b" />
      <path d="M26.5 45.5 32 51l5.5-5.5" fill="none" stroke="#e8edf3" stroke-width="2.2" />
      <ellipse cx="20.6" cy="30" rx="2" ry="3.2" fill="#b77a5a" />
      <ellipse cx="43.4" cy="30" rx="2" ry="3.2" fill="#b77a5a" />
      <ellipse cx="32" cy="29" rx="11.6" ry="13.8" :fill="url('skin')" />
      <path d="M20.6 27.5c-.6-10 5.4-14.8 11.9-14.8 7.6 0 12 5 11 14.6-1.4-5.3-5.6-8.2-11.5-7.9-6 .2-10 3-11.4 8.1z" fill="#33251e" />
      <path d="M21.4 31c.9 9.3 5 12.6 10.6 12.6S41.7 40.3 42.6 31c-2 5.6-5.6 7.6-10.6 7.6s-8.6-2-10.6-7.6z" fill="#4a372c" opacity="0.88" />
      <path d="M24.6 25.6q2.6-1.4 5 0M34.4 25.6q2.6-1.4 5 0" fill="none" stroke="#33251e" stroke-width="1.3" stroke-linecap="round" />
      <ellipse cx="27.3" cy="28.6" rx="1.5" ry="1.1" fill="#241914" />
      <ellipse cx="36.7" cy="28.6" rx="1.5" ry="1.1" fill="#241914" />
      <path d="M32 29.5v5.5l-1.6.6" fill="none" stroke="#8d5539" stroke-width="1" stroke-linecap="round" opacity="0.7" />
      <path d="M29 37.2q3 1.2 6 0" fill="none" stroke="#6b3d2b" stroke-width="1.2" stroke-linecap="round" />
    </svg>
    <svg v-else-if="who === 'ivy'" viewBox="0 0 64 64">
      <defs>
        <radialGradient :id="id('bg')" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="#b8ecd2" /><stop offset="1" stop-color="#4fae86" /></radialGradient>
        <radialGradient :id="id('skin')" cx="0.4" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffe3cc" /><stop offset="1" stop-color="#e59c76" /></radialGradient>
        <radialGradient :id="id('hair')" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#b86234" /><stop offset="1" stop-color="#6e3519" /></radialGradient>
      </defs>
      <rect width="64" height="64" :fill="url('bg')" />
      <ellipse cx="49" cy="20" rx="7" ry="9" :fill="url('hair')" transform="rotate(30 49 20)" />
      <ellipse cx="32" cy="31" rx="19" ry="18" :fill="url('hair')" />
      <path d="M12 64c2-10 10-14.5 20-14.5S50 54 52 64z" fill="#ff7a59" />
      <circle cx="32" cy="34" r="15.5" :fill="url('skin')" />
      <path d="M16.5 32c-.5-10 7-17.5 16-17.5 7 0 13 4.5 14.5 12-6-4.5-13.5-6-21.5-3.2-3.8 1.4-7 4.5-9 8.7z" :fill="url('hair')" />
      <ellipse cx="26" cy="35" rx="4" ry="4.7" fill="#fff" />
      <ellipse cx="38" cy="35" rx="4" ry="4.7" fill="#fff" />
      <circle cx="26.6" cy="35.6" r="2.9" fill="#2f6b4f" />
      <circle cx="38.6" cy="35.6" r="2.9" fill="#2f6b4f" />
      <circle cx="26.8" cy="35.8" r="1.5" fill="#101010" />
      <circle cx="38.8" cy="35.8" r="1.5" fill="#101010" />
      <circle cx="27.8" cy="34.4" r="0.9" fill="#fff" />
      <circle cx="39.8" cy="34.4" r="0.9" fill="#fff" />
      <ellipse cx="21.5" cy="41" rx="2.6" ry="1.6" fill="#f2836a" opacity="0.5" />
      <ellipse cx="42.5" cy="41" rx="2.6" ry="1.6" fill="#f2836a" opacity="0.5" />
      <path d="M28.5 42.2q3.5 3.4 7 0" fill="#9e3a2c" />
    </svg>
    <svg v-else-if="who === 'pixel'" viewBox="0 0 64 64" shape-rendering="crispEdges">
      <rect width="64" height="64" fill="#2a1f4e" />
      <g transform="translate(0 2)">
        <rect v-for="p in pixels" :key="`${p.x}-${p.y}`" :class="{ 'pixel-eye': p.eye }" :x="p.x * 4" :y="p.y * 4" width="4" height="4" :fill="p.fill" />
      </g>
    </svg>
    <svg v-else-if="who === 'nova'" viewBox="0 0 64 64">
      <defs>
        <linearGradient :id="id('bg')" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1e8" /><stop offset="1" stop-color="#c3b2ff" /></linearGradient>
        <linearGradient :id="id('iris')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a6b" /><stop offset="1" stop-color="#7d5cff" /></linearGradient>
      </defs>
      <rect width="64" height="64" :fill="url('bg')" />
      <path d="M14 30c0-12 8-19 18-19s18 7 18 19c0 9-1 18-3 26H17c-2-8-3-17-3-26z" fill="#6f5ad6" />
      <path d="M14 64c3-9 9.5-13 18-13s15 4 18 13z" fill="#2d2a4a" />
      <path d="M27 51l5 6 5-6" fill="#fff" />
      <rect x="28.5" y="42" width="7" height="9" fill="#f6cdb8" />
      <path d="M20.5 28q0 14 11.5 19 11.5-5 11.5-19 0-11-11.5-11T20.5 28z" fill="#ffe6d8" />
      <ellipse cx="26.6" cy="33" rx="3.4" ry="4.5" :fill="url('iris')" />
      <ellipse cx="37.4" cy="33" rx="3.4" ry="4.5" :fill="url('iris')" />
      <circle cx="27.6" cy="31.4" r="1.3" fill="#fff" />
      <circle cx="38.4" cy="31.4" r="1.3" fill="#fff" />
      <path d="M22.6 29.4q4-2.6 8 0M33.4 29.4q4-2.6 8 0" fill="none" stroke="#2a1a3d" stroke-width="1.5" stroke-linecap="round" />
      <path d="M23 38.4l2.6-.8M38.4 37.6l2.6.8" stroke="#f08ab4" stroke-width="1.2" stroke-linecap="round" />
      <path d="M30.6 40.6q1.4 1 2.8 0" fill="none" stroke="#9c3d58" stroke-width="1.1" stroke-linecap="round" />
      <path d="M18.5 32 20.5 18Q32 8 43.5 18l2 14-4.4-9-2.4 6.4-3.4-8.6-3.3 7.6-3.3-7.6-3.4 8.6-2.4-6.4z" fill="#8e7cf0" />
      <path d="M25 15.5q5-3 10-1.5" fill="none" stroke="#c9bfff" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <svg v-else-if="who === 'coco'" viewBox="0 0 64 64">
      <defs>
        <radialGradient :id="id('bg')" cx="0.5" cy="0.4" r="0.75"><stop offset="0" stop-color="#ffecc2" /><stop offset="1" stop-color="#ffb547" /></radialGradient>
        <radialGradient :id="id('fur')" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffc07a" /><stop offset="1" stop-color="#d9701c" /></radialGradient>
      </defs>
      <rect width="64" height="64" :fill="url('bg')" />
      <path d="M14 30 15 10l15 11zM50 30 49 10 34 21z" :fill="url('fur')" />
      <path d="M17.5 25.5 18 15l7.5 6zM46.5 25.5 46 15l-7.5 6z" fill="#ff9fa0" />
      <path d="M8 64c3-10 12-14 24-14s21 4 24 14z" :fill="url('fur')" />
      <ellipse cx="32" cy="36" rx="19" ry="16.5" :fill="url('fur')" />
      <path d="M28 21.5v5M32 20.5v6M36 21.5v5" stroke="#b9560d" stroke-width="2" stroke-linecap="round" />
      <ellipse cx="32" cy="43" rx="9" ry="6.5" fill="#fff3e6" />
      <ellipse cx="25" cy="35" rx="3.7" ry="4.3" fill="#2b1d10" />
      <ellipse cx="39" cy="35" rx="3.7" ry="4.3" fill="#2b1d10" />
      <circle cx="26.2" cy="33.4" r="1.3" fill="#fff" />
      <circle cx="40.2" cy="33.4" r="1.3" fill="#fff" />
      <path d="M30 40h4l-2 2.2z" fill="#f07a8a" />
      <path d="M29 44q3 2.4 3-1.4 0 3.8 3 1.4" fill="none" stroke="#7a4a1e" stroke-width="1.1" stroke-linecap="round" />
      <path d="M21 42l-7-1M21 44.5l-6.5 1.5M43 42l7-1M43 44.5l6.5 1.5" stroke="#7a4a1e" stroke-width="0.8" stroke-linecap="round" opacity="0.55" />
    </svg>
  </span>
</template>

<style scoped>
.contact-avatar svg { width: 100%; height: 100%; }
.pixel-eye { animation: pixel-blink 4.8s infinite steps(1); }
@keyframes pixel-blink { 0%, 92%, 100% { opacity: 1; } 94%, 97% { opacity: 0; } }
</style>
