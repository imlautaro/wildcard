<script setup lang="ts">
// Contact creation: the editor cycles through the portrait styles. Each one swaps
// the portrait, types the name and moves the temperament sliders (the app has 17;
// four are shown).
const order: CastId[] = ['mila', 'nova', 'ivy', 'theo', 'coco', 'pixel'];
const { t } = useI18n();
const styles = computed(() => [
  t('creatorScene.cartoon'), t('creatorScene.anime'), t('creatorScene.movie'),
  t('creatorScene.realistic'), t('creatorScene.pets'), t('creatorScene.custom'),
]);
const traits: Record<CastId, number[]> = {
  mila: [86, 70, 64, 92],
  nova: [58, 82, 74, 40],
  ivy: [62, 88, 80, 30],
  theo: [44, 66, 52, 12],
  coco: [78, 96, 70, 76],
  pixel: [90, 54, 66, 58],
};
const traitNames = computed(() => [t('creatorScene.humor'), t('creatorScene.warmth'), t('creatorScene.initiative'), t('creatorScene.emoji')]);

const root = ref<HTMLElement | null>(null);
const { step, fading } = useScene(root, [2600, 2600, 2600, 2600, 2600], { hold: 2600 });
const current = computed(() => order[Math.min(step.value, order.length - 1)]!);
const member = computed(() => cast[current.value]);
const styleIndex = computed(() => Math.min(step.value, order.length - 1));
</script>

<template>
  <div ref="root" class="creator scene stage stage-pad" :class="{ fading }">
    <div class="styles" aria-hidden="true">
      <span v-for="(style, index) in styles" :key="style" class="style" :class="{ on: index === styleIndex }">
        <SiteIcon v-if="index === styleIndex" name="done" />{{ style }}
      </span>
    </div>

    <div class="editor">
      <div class="portrait">
        <Transition name="morph" mode="out-in">
          <ContactAvatar showcase :key="current" :who="current" :size="168" />
        </Transition>
        <span class="regen"><SiteIcon name="wand" />{{ t('creatorScene.generate') }}</span>
      </div>

      <div class="fields">
        <div class="field-box">
          <small>{{ t('creatorScene.name') }}</small>
          <span :key="current" class="typed" :style="{ '--chars': member.name.length }">{{ member.name }}</span>
        </div>
        <div class="field-box">
          <small>{{ current === 'pixel' ? t('creatorScene.customStyle') : t('creatorScene.whoTheyAre') }}</small>
          <Transition name="fade" mode="out-in">
            <span :key="current">{{ current === 'pixel' ? t('creatorScene.customValue') : t(`cast.${current}`) }}</span>
          </Transition>
        </div>
        <div class="sliders">
          <div v-for="(trait, index) in traitNames" :key="trait" class="slider">
            <span class="slider-label">{{ trait }}</span>
            <span class="track"><span class="fill" :style="{ width: `${traits[current][index]}%` }" /><span class="thumb" :style="{ left: `${traits[current][index]}%` }" /></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.creator { display: flex; flex-direction: column; gap: var(--space-6); }
.styles { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.style {
  display: inline-flex; align-items: center; gap: var(--space-1); height: 32px; padding: 0 var(--space-3);
  border-radius: var(--md-shape-s); box-shadow: inset 0 0 0 1px var(--md-outline-variant); color: var(--md-on-surface-variant);
  font: var(--type-label-large); font-size: 13px; transition: background-color 250ms linear, color 250ms linear, box-shadow 250ms linear;
}
.style svg { width: 16px; height: 16px; }
.style.on { background: var(--md-secondary-container); color: var(--md-on-secondary-container); box-shadow: none; }

.editor { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-8); align-items: center; }
.portrait { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); }
.portrait :deep(.avatar) { box-shadow: var(--md-elevation-2); }
.regen { display: inline-flex; align-items: center; gap: var(--space-1-5); font: var(--type-label-large); color: var(--md-primary); }
.regen svg { width: 18px; height: 18px; }
.morph-enter-active { transition: transform 520ms var(--ui-ease-spring), opacity 260ms, filter 400ms; }
.morph-leave-active { transition: transform 240ms var(--md-ease-accelerate), opacity 200ms, filter 240ms; }
.morph-enter-from { opacity: 0; transform: scale(0.8) rotate(-6deg); filter: blur(6px); }
.morph-leave-to { opacity: 0; transform: scale(0.9); filter: blur(6px); }

.fields { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.field-box {
  display: flex; flex-direction: column; padding: var(--space-2) var(--space-4); border-radius: var(--md-shape-m);
  background: var(--md-surface); font: var(--type-body-large);
}
.field-box small { font: var(--type-label-medium); color: var(--md-primary); }
.typed {
  display: inline-block; width: fit-content; overflow: hidden; white-space: nowrap; font-weight: 700;
  border-right: 2px solid var(--md-primary); padding-right: 2px;
  animation: type 700ms steps(var(--chars)) both, caret 900ms steps(1) infinite;
}
@keyframes type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes caret { 50% { border-color: transparent; } }
.fade-enter-active, .fade-leave-active { transition: opacity 220ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.sliders { display: grid; gap: var(--space-3); padding: var(--space-2) var(--space-1) 0; }
.slider { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.slider-label { font: var(--type-label-large); color: var(--md-on-surface-variant); }
.track { position: relative; height: 6px; border-radius: 3px; background: var(--md-secondary-container); }
.fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--md-primary); transition: width 900ms var(--md-ease); }
.thumb {
  position: absolute; top: 50%; width: 4px; height: 22px; margin-left: -2px; border-radius: 2px; background: var(--md-primary);
  transform: translateY(-50%); transition: left 900ms var(--md-ease);
}
@media (max-width: 560px) {
  .editor { grid-template-columns: minmax(0, 1fr); }
  .portrait :deep(.avatar) { width: 132px !important; height: 132px !important; }
}
</style>
