<script setup lang="ts">
// Hero: three contacts as identity cards, each with its own personality and memory.
// The cards are dealt in, then each gets a badge for what makes it more than an
// assistant: Theo is in a group, Coco is shared with Sabrina, Ivy texted first.
// The entrance is CSS only (it plays once from the prerendered HTML, no flash on
// hydration); with prefers-reduced-motion the cards are simply there.
const { t } = useI18n();
const cards = [
  { who: 'theo', badge: 'group', icon: 'users' },
  { who: 'coco', badge: 'shared', icon: 'share' },
  { who: 'ivy', badge: 'first', icon: 'bell' },
] as const;
</script>

<template>
  <div class="fan">
    <article v-for="(c, i) in cards" :key="c.who" class="id-card" :class="`c${i}`">
      <ContactAvatar :who="c.who" :size="72" />
      <strong class="name">{{ cast[c.who].name }}</strong>
      <small class="role">{{ t(`heroCards.${c.who}.role`) }}</small>
      <div class="traits">
        <span v-for="trait in t(`heroCards.${c.who}.traits`).split(' · ')" :key="trait">{{ trait }}</span>
      </div>
      <div class="remembers">
        <SiteIcon name="brain" />
        <span><small>{{ t('heroCards.remembers') }}</small>{{ t(`heroCards.${c.who}.memory`) }}</span>
      </div>
      <div class="card-badge" :class="`is-${c.badge}`">
        <AppIcon v-if="c.icon === 'share'" name="share" />
        <SiteIcon v-else :name="c.icon" />
        {{ t(`heroCards.${c.who}.badge`) }}
      </div>
    </article>
  </div>
</template>

<style scoped>
.fan { position: relative; width: 100%; max-width: 600px; height: 500px; margin: 0 auto; }
/* Deal order: Coco, Theo, Ivy. Badge order: Theo, Coco, Ivy. */
.id-card {
  --tilt: 0deg; --x: 0; --deal: 0ms; --badge: 0ms;
  position: absolute; width: 224px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: var(--space-6) var(--space-5) var(--space-5); border-radius: 28px; text-align: center;
  background: var(--md-surface-container-lowest); box-shadow: var(--md-elevation-3);
  transform: translateX(var(--x)) rotate(var(--tilt));
  animation: deal 700ms var(--ui-ease-spring) var(--deal) both;
}
:root[data-theme="dark"] .id-card { background: var(--md-surface-container-high); }
.c0 { left: 0; top: 90px; --tilt: -6deg; --deal: 550ms; --badge: 1500ms; }
.c1 { left: 50%; top: 30px; --x: -50%; z-index: 2; --deal: 200ms; --badge: 2300ms; }
.c2 { right: 0; top: 110px; --tilt: 6deg; --deal: 850ms; --badge: 3100ms; }
@keyframes deal {
  from { opacity: 0; transform: translate(var(--x), 48px) rotate(0deg) scale(0.9); }
  to { opacity: 1; transform: translateX(var(--x)) rotate(var(--tilt)); }
}
.name { margin-top: var(--space-2); font: var(--type-title-large); }
.role { color: var(--md-on-surface-variant); font: var(--type-body-medium); }
.traits { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin: var(--space-2) 0; }
.traits span { padding: 3px 10px; border-radius: var(--md-shape-full); background: var(--md-secondary-container); color: var(--md-on-secondary-container); font: var(--type-label-small); }
.remembers {
  display: flex; align-items: flex-start; gap: var(--space-2); width: 100%; padding: var(--space-2) var(--space-3);
  border-radius: 14px; background: var(--md-surface-container); font: var(--type-body-small); text-align: left;
}
.remembers span { display: flex; flex-direction: column; line-height: 1.35; }
.remembers small { color: var(--md-on-surface-variant); font: var(--type-label-small); }
.remembers svg, .card-badge svg { width: 16px; height: 16px; flex: none; margin-top: 1px; color: var(--md-primary); }
.card-badge {
  display: inline-flex; align-items: center; gap: 6px; margin-top: var(--space-2); padding: 5px 12px;
  border-radius: var(--md-shape-full); background: var(--md-primary-container); color: var(--md-on-primary-container);
  font: var(--type-label-medium); white-space: nowrap;
  animation: badge 550ms var(--ui-ease-spring) var(--badge) both;
}
@keyframes badge { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: none; } }
.card-badge.is-first { background: var(--md-tertiary-container); color: var(--md-on-tertiary-container); }
.card-badge.is-first svg { color: var(--md-tertiary); animation: ring 900ms ease-in-out calc(var(--badge) + 400ms); }
@keyframes ring { 0%, 100% { transform: rotate(0); } 20%, 60% { transform: rotate(-14deg); } 40%, 80% { transform: rotate(14deg); } }

@media (max-width: 560px) {
  .fan { height: 430px; }
  .id-card { width: 188px; padding: var(--space-5) var(--space-4) var(--space-4); }
  .c0 { top: 80px; --tilt: -5deg; }
  .c2 { top: 100px; --tilt: 5deg; }
  .remembers { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .id-card, .card-badge, .card-badge.is-first svg { animation: none; }
}
</style>
