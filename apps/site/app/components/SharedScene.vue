<script setup lang="ts">
// A shared contact: two people, two private chats, one memory. Coco answers Sabrina
// with what Bruno told it, relays a message, and starts a timer on Sabrina's iPhone.
const root = ref<HTMLElement | null>(null);
// Beats: 1 Bruno fact · 2 typing · 3 ack · 4 Sabrina asks · 5 typing · 6 answer ·
// 7 Bruno relay request · 8 relayed · 9 timer request · 10 timer running
const { t } = useI18n();
const { step, fading, composer } = useChatScene(root, [700, 1000, 1200, 1500, 1000, 1500, 2000, 1500, 2000, 1500], [
  { step: 1, composer: 'bruno', text: () => t('sharedScene.fact') },
  { step: 4, composer: 'sabrina', text: () => t('sharedScene.ask') },
  { step: 7, composer: 'bruno', text: () => t('sharedScene.relay') },
  { step: 9, composer: 'bruno', text: () => t('sharedScene.timer') },
], { hold: 5200 });
</script>

<template>
  <div ref="root" class="shared scene" :class="{ fading }">
    <PhoneFrame v-bind="composer('bruno')" :caption="t('sharedScene.brunoChat')" title="Coco" who="coco" :status="t('sharedScene.sharedWith')" class="shared-phone">
      <div class="thread">
        <div v-if="step >= 1" class="bubble-row outgoing pop"><div class="bubble">{{ t('sharedScene.fact') }}</div></div>
        <div v-if="step === 2" class="bubble-row incoming pop"><div class="typing"><span /><span /><span /></div></div>
        <div v-if="step >= 3" class="bubble-row incoming pop"><div class="bubble">{{ t('sharedScene.ack') }}</div></div>
        <div v-if="step >= 7" class="bubble-row outgoing pop"><div class="bubble">{{ t('sharedScene.relay') }}</div></div>
        <div v-if="step >= 8" class="bubble-row incoming pop"><div class="bubble">{{ t('sharedScene.sent') }}</div></div>
        <div v-if="step >= 9" class="bubble-row outgoing pop"><div class="bubble">{{ t('sharedScene.timer') }}</div></div>
        <div v-if="step >= 10" class="bubble-row incoming pop"><div class="bubble">{{ t('sharedScene.timerDone') }}</div></div>
      </div>
    </PhoneFrame>

    <div class="bridge" aria-hidden="true">
      <span class="bridge-line" :class="{ live: step >= 4 }" />
      <span class="bridge-node"><ContactAvatar who="coco" :size="44" /><small>{{ t('sharedScene.oneMemory') }}</small></span>
      <span class="bridge-line" :class="{ live: step >= 4 }" />
    </div>

    <PhoneFrame v-bind="composer('sabrina')" :caption="t('sharedScene.sabrinaChat')" title="Coco" who="coco" :status="t('sharedScene.sharedBy')" class="shared-phone">
      <div class="thread">
        <div v-if="step >= 4" class="bubble-row outgoing pop"><div class="bubble">{{ t('sharedScene.ask') }}</div></div>
        <div v-if="step === 5" class="bubble-row incoming pop"><div class="typing"><span /><span /><span /></div></div>
        <div v-if="step >= 6" class="bubble-row incoming pop"><i18n-t keypath="sharedScene.answer" tag="div" class="bubble" scope="global"><template #time><strong>{{ t('sharedScene.answerTime') }}</strong></template></i18n-t></div>
        <div v-if="step >= 8" class="bubble-row incoming pop">
          <div class="bubble"><span class="relay">{{ t('sharedScene.relayFrom') }}</span>{{ t('sharedScene.relayText') }}</div>
        </div>
      </div>
      <Transition name="alarm">
        <div v-if="step >= 10" class="timer">
          <span class="timer-ring"><SiteIcon name="stopwatch" /></span>
          <span class="timer-text"><small>{{ t('sharedScene.timerLabel') }}</small><strong class="tabular">19:59</strong></span>
          <span class="timer-allowed"><SiteIcon name="user-check" />{{ t('sharedScene.allowed') }}</span>
        </div>
      </Transition>
    </PhoneFrame>
  </div>
</template>

<style scoped>
.shared { display: grid; grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr); align-items: center; gap: var(--space-2); }
.bridge { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); height: 100%; justify-content: center; padding-top: 40px; }
.bridge-line { width: 2px; flex: 0 0 90px; border-radius: 1px; background: var(--md-outline-variant); position: relative; overflow: hidden; }
.bridge-line.live::after {
  content: ''; position: absolute; left: 0; right: 0; height: 40%; background: var(--md-primary);
  animation: flow 1.4s linear infinite;
}
@keyframes flow { from { top: -40%; } to { top: 100%; } }
.bridge-node { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); text-align: center; }
.bridge-node small { font: var(--type-label-small); color: var(--md-on-surface-variant); }

.timer {
  position: absolute; left: 10px; right: 10px; top: 8px; display: grid; grid-template-columns: auto 1fr; gap: var(--space-1) var(--space-3);
  align-items: center; padding: var(--space-3) var(--space-4); border-radius: 24px; background: #1d1d1f; color: #fff; box-shadow: var(--md-elevation-3);
}
.timer-ring {
  display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: #ff9f0a; color: #1d1d1f;
  animation: ring 1.6s var(--md-ease) infinite;
}
.timer-ring svg { width: 24px; height: 24px; }
@keyframes ring { 0%, 100% { box-shadow: 0 0 0 0 rgb(255 159 10 / 50%); } 60% { box-shadow: 0 0 0 10px rgb(255 159 10 / 0%); } }
.timer-text { display: flex; flex-direction: column; line-height: 1.1; }
.timer-text small { font: var(--type-label-medium); opacity: 0.7; }
.timer-text strong { font: 700 30px / 1.1 var(--font-sans); letter-spacing: -0.02em; color: #ff9f0a; }
.timer-allowed { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: var(--space-1); font: var(--type-label-small); opacity: 0.75; }
.timer-allowed svg { width: 14px; height: 14px; }
.alarm-enter-active { transition: transform 600ms var(--ui-ease-spring), opacity 300ms; }
.alarm-enter-from { transform: translateY(-120%); opacity: 0; }

@media (max-width: 860px) {
  .shared { grid-template-columns: minmax(0, 1fr); }
  .bridge { flex-direction: row; padding: 0; }
  .bridge-line { width: auto; height: 2px; flex: 0 0 60px; }
  .bridge-line.live::after { top: 0; bottom: 0; height: auto; width: 40%; animation-name: flow-x; }
  @keyframes flow-x { from { left: -40%; } to { left: 100%; } }
}
</style>
