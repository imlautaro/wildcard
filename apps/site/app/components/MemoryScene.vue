<script setup lang="ts">
// Memory: the same facts and the same three chats, side by side. Left, one memory
// for everything: the facts are tangled together and every reply drags in another
// chat's business. Right, Wildcard: one memory per contact and on-topic replies.
// Both sides answer at the same beat, so the difference reads at a glance.
interface Lane { who: CastId; chat: string; facts: [string, string]; leaked: string; clean: string }
const { t } = useI18n();
const lanes = computed<Lane[]>(() => [
  { who: 'theo', chat: t('memoryScene.theoChat'), facts: [t('memoryScene.factOpening'), t('memoryScene.factSupplier')], leaked: t('memoryScene.theoLeaked'), clean: t('memoryScene.theoClean') },
  { who: 'ivy', chat: t('memoryScene.ivyChat'), facts: [t('memoryScene.factMarathon'), t('memoryScene.factPace')], leaked: t('memoryScene.ivyLeaked'), clean: t('memoryScene.ivyClean') },
  { who: 'pixel', chat: t('memoryScene.pixelChat'), facts: [t('memoryScene.factExam'), t('memoryScene.factEntropy')], leaked: t('memoryScene.pixelLeaked'), clean: t('memoryScene.pixelClean') },
]);
// The pooled memory shuffles every chat's facts together.
const tangled = computed(() => {
  const [a, b, c] = lanes.value.map((lane) => lane.facts);
  return [a![0], c![1], b![1], a![1], c![0], b![0]];
});

const root = ref<HTMLElement | null>(null);
// Beats: 1 facts · 2–4 replies from Theo, Ivy, Pixel on both sides
const { step, fading } = useScene(root, [700, 1500, 1800, 1800], { hold: 5200 });
</script>

<template>
  <div ref="root" class="memory-scene scene" :class="{ fading }">
    <div class="side pooled">
      <header>
        <span class="mark"><SiteIcon name="close" /></span>
        <span><strong>{{ t('memoryScene.others') }}</strong><small>{{ t('memoryScene.pooled') }}</small></span>
      </header>
      <div class="tangle">
        <SiteIcon name="brain" class="tangle-icon" />
        <span v-for="(fact, i) in tangled" :key="fact" class="fact" :class="[`t${i}`, { in: step >= 1 }]" :style="{ '--i': i }">{{ fact }}</span>
      </div>
      <div class="replies">
        <div v-for="(lane, i) in lanes" :key="lane.who" class="reply" :class="{ in: step >= 2 + i }">
          <ContactAvatar :who="lane.who" :size="30" />
          <div>
            <p class="msg leaked">{{ lane.leaked }}</p>
            <span class="verdict bad"><SiteIcon name="close" />{{ t('memoryScene.offTopic') }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="side separate">
      <header>
        <span class="mark"><SiteIcon name="check" /></span>
        <span><strong>Wildcard</strong><small>{{ t('memoryScene.perContact') }}</small></span>
      </header>
      <div v-for="(lane, i) in lanes" :key="lane.who" class="lane">
        <div class="who">
          <ContactAvatar :who="lane.who" :size="36" />
          <span><strong>{{ cast[lane.who].name }}</strong><small>{{ lane.chat }}</small></span>
        </div>
        <div class="facts">
          <span v-for="fact in lane.facts" :key="fact" class="fact" :class="{ in: step >= 1 }">{{ fact }}</span>
        </div>
        <div class="reply" :class="{ in: step >= 2 + i }">
          <p class="msg">{{ lane.clean }}</p>
          <span class="verdict ok"><SiteIcon name="check" />{{ t('memoryScene.onTopic') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-scene { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: var(--space-4); align-items: stretch; }
.side { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; padding: clamp(16px, 2.5vw, 24px); border-radius: var(--site-radius); }
.side header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-1); }
.side header > span:last-child { display: flex; flex-direction: column; line-height: 1.25; }
.side header strong { font: var(--type-title-medium); }
.side header small { font: var(--type-body-small); opacity: 0.8; }
.mark { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: var(--md-shape-full); }
.mark svg { width: 18px; height: 18px; }

.pooled { background: var(--md-surface-container-low); color: var(--md-on-surface-variant); }
.pooled .mark { background: color-mix(in srgb, var(--md-error) 14%, transparent); color: var(--md-error); }
.separate { background: var(--md-primary-container); color: var(--md-on-primary-container); }
.separate .mark { background: var(--md-primary); color: var(--md-on-primary); }

.fact {
  display: inline-flex; align-items: center; height: 28px; padding: 0 var(--space-3); border-radius: var(--md-shape-full);
  background: var(--md-surface); color: var(--md-on-surface); box-shadow: var(--md-elevation-1);
  font: var(--type-label-medium); font-size: 12.5px; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
  opacity: 0; transform: scale(0.8); transition: opacity 300ms, transform 450ms var(--ui-ease-spring);
}
.fact.in { opacity: 1; transform: rotate(var(--r, 0deg)); }

.tangle {
  position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-2); padding: var(--space-5) var(--space-3);
  border-radius: var(--md-shape-xl); border: 2px dashed color-mix(in srgb, var(--md-error) 35%, var(--md-outline-variant));
  background: color-mix(in srgb, var(--md-error) 5%, transparent);
}
.tangle-icon { position: absolute; top: -11px; left: 50%; width: 22px; height: 22px; padding: 2px; transform: translateX(-50%); border-radius: var(--md-shape-full); background: var(--md-surface-container-low); color: var(--md-error); }
.t0 { --r: -4deg; } .t1 { --r: 3deg; } .t2 { --r: -2deg; } .t3 { --r: 5deg; } .t4 { --r: -5deg; } .t5 { --r: 2deg; }
.tangle .fact.t1, .tangle .fact.t3 { margin-top: 6px; }
.tangle .fact { transition-delay: calc(var(--i, 0) * 60ms); }

.replies { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-1); }
.reply { display: flex; gap: var(--space-2); align-items: flex-start; opacity: 0; transform: translateY(8px); transition: opacity 350ms, transform 450ms var(--md-ease-decelerate); }
.reply.in { opacity: 1; transform: none; }
.reply > div, .lane .reply { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.msg {
  margin: 0; padding: 9px 14px; border-radius: 18px 18px 18px 4px; background: var(--md-surface); color: var(--md-on-surface);
  font: var(--type-body-medium); font-size: 14px; line-height: 20px;
}
.msg.leaked { background: color-mix(in srgb, var(--md-error) 8%, var(--md-surface)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--md-error) 35%, transparent); }
.verdict { display: inline-flex; align-items: center; gap: 4px; font: var(--type-label-small); }
.verdict svg { width: 14px; height: 14px; }
.verdict.bad { color: var(--md-error); }
.verdict.ok { color: var(--md-success); }

.lane {
  display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: var(--space-2) var(--space-4); align-items: start;
  padding: var(--space-3) var(--space-4); border-radius: var(--md-shape-xl); background: color-mix(in srgb, var(--md-surface) 55%, transparent); color: var(--md-on-surface);
}
.lane .who { display: flex; align-items: center; gap: var(--space-2); grid-row: span 2; min-width: 0; }
.lane .who span { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.lane .who strong { font: var(--type-title-small); }
.lane .who small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.facts { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
.lane .msg { background: var(--md-surface); }

@media (max-width: 900px) {
  .memory-scene { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 520px) {
  .lane { grid-template-columns: minmax(0, 1fr); }
  .lane .who { grid-row: auto; }
}
</style>
