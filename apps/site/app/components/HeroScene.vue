<script setup lang="ts">
// Hero: the app's chat list while contacts write first. Each contact types, then
// its row jumps to the top with an unread badge and a notification banner drops in.
interface Row { who: CastId; preview: string; time: string; unread: number; typing: boolean }

// Times are messages too: the mock clock reads as each locale writes it.
const { t } = useI18n();
const events = computed<{ who: CastId; text?: string; time?: string }[]>(() => [
  { who: 'mila' },
  { who: 'mila', text: t('heroScene.milaNew'), time: t('heroScene.milaNewTime') },
  { who: 'ivy' },
  { who: 'ivy', text: t('heroScene.ivyNew'), time: t('heroScene.ivyNewTime') },
  { who: 'theo' },
  { who: 'theo', text: t('heroScene.theoNew'), time: t('heroScene.theoNewTime') },
]);
const base = computed<Row[]>(() => [
  { who: 'nova', preview: t('heroScene.nova'), time: t('heroScene.novaTime'), unread: 0, typing: false },
  { who: 'pixel', preview: t('heroScene.pixel'), time: t('heroScene.pixelTime'), unread: 0, typing: false },
  { who: 'theo', preview: t('heroScene.theo'), time: t('heroScene.theoTime'), unread: 0, typing: false },
  { who: 'coco', preview: t('heroScene.coco'), time: t('heroScene.cocoTime'), unread: 0, typing: false },
  { who: 'ivy', preview: t('heroScene.ivy'), time: t('heroScene.ivyTime'), unread: 0, typing: false },
  { who: 'mila', preview: t('heroScene.mila'), time: t('heroScene.milaTime'), unread: 0, typing: false },
]);

const root = ref<HTMLElement | null>(null);
const { step, fading } = useScene(root, [1100, 1500, 2600, 1500, 2600, 1500], { hold: 3600 });

const state = computed(() => {
  const rows = base.value.map((row) => ({ ...row }));
  let banner: { who: CastId; text: string } | null = null;
  for (const event of events.value.slice(0, step.value)) {
    const index = rows.findIndex((row) => row.who === event.who);
    const row = rows[index]!;
    if (!event.text) { row.typing = true; banner = null; continue; }
    rows.splice(index, 1);
    rows.unshift({ ...row, preview: event.text, time: event.time!, unread: row.unread + 1, typing: false });
    banner = { who: event.who, text: event.text };
  }
  return { rows, banner };
});
</script>

<template>
  <div ref="root" class="hero-scene scene" :class="{ fading }">
    <PhoneFrame class="hero-phone">
      <div class="list-head">
        <span>{{ t('heroScene.chats') }}</span>
        <span class="compose" aria-hidden="true"><AppIcon name="compose" /></span>
      </div>
      <Transition name="banner">
        <div v-if="state.banner" :key="state.banner.who" class="banner">
          <ContactAvatar :who="state.banner.who" :size="36" />
          <div class="banner-text">
            <span class="banner-top"><strong>{{ cast[state.banner.who].name }}</strong><small>{{ t('heroScene.now') }}</small></span>
            <span class="banner-body">{{ state.banner.text }}</span>
          </div>
        </div>
      </Transition>
      <TransitionGroup tag="ul" name="row" class="rows">
        <li v-for="row in state.rows" :key="row.who" class="row" :class="{ unread: row.unread }">
          <ContactAvatar :who="row.who" :size="48" />
          <div class="row-text">
            <span class="row-top">
              <strong>{{ cast[row.who].name }}</strong>
              <small class="tabular">{{ row.time }}</small>
            </span>
            <span class="row-bottom">
              <span v-if="row.typing" class="row-typing">{{ t('heroScene.typing') }}</span>
              <span v-else class="row-preview">{{ row.preview }}</span>
              <span v-if="row.unread" class="badge">{{ row.unread }}</span>
            </span>
          </div>
        </li>
      </TransitionGroup>
    </PhoneFrame>
  </div>
</template>

<style scoped>
.hero-scene { position: relative; display: flex; justify-content: center; padding: var(--space-6) 0; }
.hero-phone { --phone-width: 360px; width: 100%; }
.hero-phone :deep(.phone-screen) { justify-content: flex-start; padding: 0; }
.list-head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-5) var(--space-3); font: var(--type-headline-small); letter-spacing: var(--tracking-headline); }
.compose { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
.compose svg { width: 20px; height: 20px; }
.rows { position: relative; margin: 0; padding: 0 var(--space-2); list-style: none; }
.row { display: flex; align-items: center; gap: var(--space-3); height: 68px; padding: 0 var(--space-3); border-radius: var(--md-shape-l); }
.row.unread { background: color-mix(in srgb, var(--md-primary) 7%, transparent); }
.row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.row-top, .row-bottom { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.row-top strong { flex: 1; font: var(--type-title-small); font-size: 15px; }
.row-top small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.unread .row-top small { color: var(--md-primary); font-weight: 700; }
.row-preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--type-body-medium); color: var(--md-on-surface-variant); }
.unread .row-preview { color: var(--md-on-surface); font-weight: 600; }
.row-typing { flex: 1; font: var(--type-body-medium); font-weight: 600; color: var(--md-primary); }
.row-move { transition: transform 620ms var(--md-ease); }
.row-enter-active, .row-leave-active { transition: opacity 300ms; }
.row-enter-from, .row-leave-to { opacity: 0; }

.banner {
  position: absolute; top: 6px; left: 10px; right: 10px; z-index: 5; display: flex; gap: var(--space-3); align-items: center;
  padding: var(--space-3); border-radius: 22px; background: var(--md-surface-container-highest); box-shadow: var(--md-elevation-3);
}
.banner-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.banner-top { display: flex; justify-content: space-between; font: var(--type-title-small); }
.banner-top small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.banner-body { font: var(--type-body-medium); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.banner-enter-active { transition: transform 520ms var(--ui-ease-spring), opacity 300ms; }
.banner-leave-active { transition: transform 300ms var(--md-ease-accelerate), opacity 300ms; }
.banner-enter-from, .banner-leave-to { transform: translateY(-120%); opacity: 0; }
</style>
