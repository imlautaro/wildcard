<script setup lang="ts">
// Initiative: a lock screen across a day. The clock moves forward and contacts'
// notifications stack up without the person writing first.
const { t } = useI18n();
const moments = computed(() => [
  { time: '8:12', day: t('initiativeScene.day'), who: 'ivy' as CastId, text: t('initiativeScene.ivy') },
  { time: '13:40', day: t('initiativeScene.day'), who: 'theo' as CastId, text: t('initiativeScene.theo') },
  { time: '19:05', day: t('initiativeScene.day'), who: 'mila' as CastId, text: t('initiativeScene.mila') },
  { time: '21:30', day: t('initiativeScene.day'), who: 'pixel' as CastId, text: t('initiativeScene.pixel') },
]);
const root = ref<HTMLElement | null>(null);
const { step, fading } = useScene(root, [900, 1900, 1900, 1900], { hold: 4000 });
const clock = computed(() => (step.value ? moments.value[step.value - 1]! : { time: '7:30', day: moments.value[0]!.day }));
const shown = computed(() => moments.value.slice(0, step.value).reverse());
</script>

<template>
  <div ref="root" class="initiative scene" :class="{ fading }">
    <div class="lock">
      <span class="phone-camera" aria-hidden="true" />
      <div class="lock-status" aria-hidden="true"><span class="lock-icon"><SiteIcon name="lock" /></span></div>
      <div class="lock-clock">
        <span class="lock-day">{{ clock.day }}</span>
        <Transition name="tick" mode="out-in"><span :key="clock.time" class="lock-time tabular">{{ clock.time }}</span></Transition>
      </div>
      <TransitionGroup tag="div" name="note" class="notes">
        <div v-for="moment in shown" :key="moment.time" class="note">
          <ContactAvatar :who="moment.who" :size="38" />
          <div class="note-text">
            <span class="note-top"><strong>{{ cast[moment.who].name }}</strong><small>{{ moment.time }}</small></span>
            <span>{{ moment.text }}</span>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.initiative { display: flex; justify-content: center; }
.lock {
  position: relative; display: flex; flex-direction: column; width: 100%; max-width: 360px; aspect-ratio: var(--phone-ratio); padding: var(--space-4) var(--space-3);
  overflow: hidden; border-radius: var(--phone-radius); color: #fff;
  background:
    radial-gradient(80% 60% at 20% 10%, #3b74f0 0%, transparent 60%),
    radial-gradient(70% 60% at 90% 80%, #7a4f9a 0%, transparent 60%),
    linear-gradient(160deg, #0d2a6b, #12122a);
  box-shadow: 0 0 0 8px #000, 0 0 0 9px #000, var(--md-elevation-3);
}
.lock-status { display: flex; justify-content: center; align-items: center; height: calc(var(--phone-camera-inset) + var(--phone-camera-size) - var(--space-4)); }
.lock-icon svg { width: 18px; height: 18px; }
.lock-clock { display: flex; flex-direction: column; align-items: center; margin-top: var(--space-2); }
.lock-day { font: var(--type-title-small); opacity: 0.85; }
.lock-time { font: 700 76px / 1 var(--font-sans); letter-spacing: -0.04em; }
.tick-enter-active, .tick-leave-active { transition: opacity 260ms, transform 320ms var(--md-ease); }
.tick-enter-from { opacity: 0; transform: translateY(12px); }
.tick-leave-to { opacity: 0; transform: translateY(-12px); }
.notes { display: flex; flex-direction: column; gap: var(--space-2); margin-top: auto; }
.note {
  display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3); border-radius: 22px; color: #111;
  background: rgb(255 255 255 / 72%); backdrop-filter: blur(20px) saturate(1.4); -webkit-backdrop-filter: blur(20px) saturate(1.4);
}
:root[data-theme="dark"] .note { color: #f2f2f2; background: rgb(40 40 46 / 72%); }
.note-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font: var(--type-body-medium); }
.note-top { display: flex; justify-content: space-between; font: var(--type-title-small); }
.note-top small { font: var(--type-body-small); opacity: 0.6; }
.note-move { transition: transform 500ms var(--md-ease); }
.note-enter-active { transition: transform 600ms var(--ui-ease-spring), opacity 300ms; }
.note-enter-from { opacity: 0; transform: translateY(-24px) scale(0.96); }
.note-leave-active { display: none; }
</style>
