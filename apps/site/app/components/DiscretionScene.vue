<script setup lang="ts">
// Discretion in a shared contact (docs/privacy.md#discretion): Bruno tells Coco he's
// going to bed early and that he's planning Sabrina's surprise party. When Sabrina
// plans a late movie night, Coco warns her about the early night and keeps the party.
const root = ref<HTMLElement | null>(null);
// Beats: 1 Bruno sleep · 2 typing · 3 ack · 4 Bruno party · 5 typing · 6 sealed ·
// 7 memory tags · 8 Sabrina asks · 9 typing · 10 answer
const { t } = useI18n();
const { step, fading, composer } = useChatScene(root, [700, 1000, 1300, 1500, 1000, 1400, 1200, 1500, 1200, 1600], [
  { step: 1, composer: 'bruno', text: () => t('discretionScene.sleep') },
  { step: 4, composer: 'bruno', text: () => t('discretionScene.party') },
  { step: 8, composer: 'sabrina', text: () => t('discretionScene.ask') },
], { hold: 6000 });
</script>

<template>
  <div ref="root" class="discretion scene" :class="{ fading }">
    <PhoneFrame v-bind="composer('bruno')" :caption="t('discretionScene.brunoChat')" title="Coco" who="coco" :status="t('discretionScene.sharedWith')" class="discretion-phone">
      <div class="thread">
        <div v-if="step >= 1" class="bubble-row outgoing pop"><div class="bubble">{{ t('discretionScene.sleep') }}</div></div>
        <div v-if="step === 2" class="bubble-row incoming pop"><div class="typing"><span /><span /><span /></div></div>
        <div v-if="step >= 3" class="bubble-row incoming pop"><div class="bubble">{{ t('discretionScene.sleepAck') }}</div></div>
        <div v-if="step >= 4" class="bubble-row outgoing pop"><div class="bubble">{{ t('discretionScene.party') }}</div></div>
        <div v-if="step === 5" class="bubble-row incoming pop"><div class="typing"><span /><span /><span /></div></div>
        <div v-if="step >= 6" class="bubble-row incoming pop"><div class="bubble">{{ t('discretionScene.partyAck') }}</div></div>
      </div>
    </PhoneFrame>

    <div class="memory-bridge">
      <ContactAvatar who="coco" :size="48" />
      <Transition name="tag">
        <div v-if="step >= 7" class="memory-tag shared-tag">
          <AppIcon name="share" />
          <span><strong>{{ t('discretionScene.shared') }}</strong><small>{{ t('discretionScene.sharedNote') }}</small></span>
        </div>
      </Transition>
      <Transition name="tag">
        <div v-if="step >= 7" class="memory-tag secret-tag">
          <SiteIcon name="lock" />
          <span><strong>{{ t('discretionScene.secret') }}</strong><small>{{ t('discretionScene.secretNote') }}</small></span>
        </div>
      </Transition>
    </div>

    <PhoneFrame v-bind="composer('sabrina')" :caption="t('discretionScene.sabrinaChat')" title="Coco" who="coco" :status="t('discretionScene.sharedBy')" class="discretion-phone">
      <div class="thread">
        <div v-if="step >= 8" class="bubble-row outgoing pop"><div class="bubble">{{ t('discretionScene.ask') }}</div></div>
        <div v-if="step === 9" class="bubble-row incoming pop"><div class="typing"><span /><span /><span /></div></div>
        <div v-if="step >= 10" class="bubble-row incoming pop"><div class="bubble">{{ t('discretionScene.answer') }}</div></div>
      </div>
    </PhoneFrame>
  </div>
</template>

<style scoped>
.discretion { display: grid; grid-template-columns: minmax(0, 1fr) 176px minmax(0, 1fr); align-items: center; gap: var(--space-4); }
.memory-bridge { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding-top: 40px; }
.memory-tag {
  display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-2) var(--space-3);
  border-radius: var(--md-shape-l); font: var(--type-label-medium);
}
.memory-tag svg { width: 18px; height: 18px; flex: none; }
.memory-tag span { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.memory-tag strong { font: var(--type-label-large); }
.memory-tag small { font: var(--type-label-small); opacity: 0.8; }
.shared-tag { background: var(--md-primary-container); color: var(--md-on-primary-container); }
.secret-tag { background: var(--md-surface-container-highest); color: var(--md-on-surface); }
.secret-tag svg { color: var(--md-on-surface-variant); }
.tag-enter-active { transition: transform 450ms var(--ui-ease-spring), opacity 250ms; }
.secret-tag.tag-enter-active { transition-delay: 250ms; }
.tag-enter-from { transform: translateY(8px) scale(0.96); opacity: 0; }

@media (max-width: 860px) {
  .discretion { grid-template-columns: minmax(0, 1fr); }
  .memory-bridge { flex-direction: row; flex-wrap: wrap; justify-content: center; padding: 0; }
  .memory-tag { width: auto; }
}
</style>
