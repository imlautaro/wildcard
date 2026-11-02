<script setup lang="ts">
// Memory: the same facts as one global pool that leaks into every chat, then as
// one memory per contact. The chips fly between the pool and the per-contact
// vaults (FLIP), and each chat's latest reply changes with the mode.
interface Lane { who: CastId; chat: string; leaked: string; clean: string }
const lanes: Lane[] = [
  {
    who: 'theo', chat: 'Bakery launch',
    leaked: 'For the logo, what about a croissant crossing a marathon finish line? 🏃',
    clean: 'Soft opening is on the 14th. Want me to draft the invite list?',
  },
  {
    who: 'ivy', chat: 'Marathon training',
    leaked: 'Great tempo run! Treat yourself with the oat-milk latte you are about to sell 🥐',
    clean: 'Week 9 done. Thursday is an easy 8K, keep it conversational.',
  },
  {
    who: 'pixel', chat: 'Exam prep',
    leaked: 'Entropy is like your bakery budget: it only goes up 📈',
    clean: 'Entropy question 4: want a hint or the full solution?',
  },
];
const chips: { id: string; text: string; lane: number }[] = [
  { id: 'opening', text: '🥐 Opens on the 14th', lane: 0 },
  { id: 'supplier', text: '🥛 Oat-milk supplier', lane: 0 },
  { id: 'marathon', text: '🏃 Marathon on May 3', lane: 1 },
  { id: 'pace', text: '⏱️ Goal pace 5:40/km', lane: 1 },
  { id: 'exam', text: '📚 Thermo exam Friday', lane: 2 },
  { id: 'entropy', text: '🔋 Stuck on entropy', lane: 2 },
];

const root = ref<HTMLElement | null>(null);
// 0 pooled · 1–3 leaked replies · 4 separated · 5–7 clean replies
const { step, fading } = useScene(root, [1400, 1300, 1300, 2600, 1500, 1200, 1200], { hold: 4400 });
const separated = computed(() => step.value >= 4);
const replyShown = (lane: number) => (separated.value ? step.value >= 5 + lane : step.value >= 1 + lane);

// FLIP: measure every chip before the DOM moves, then animate from the old spot.
const chipRefs = new Map<string, HTMLElement>();
const setChip = (id: string) => (el: unknown) => { if (el instanceof HTMLElement) chipRefs.set(id, el); else chipRefs.delete(id); };
watch(separated, async () => {
  const before = new Map([...chipRefs].map(([id, el]) => [id, el.getBoundingClientRect()]));
  await nextTick();
  for (const [id, el] of chipRefs) {
    const from = before.get(id);
    if (!from) continue;
    const to = el.getBoundingClientRect();
    el.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` },
      { transform: 'none' },
    ], { duration: 900, easing: 'cubic-bezier(0.2, 0, 0, 1)', delay: chips.findIndex((c) => c.id === id) * 50, fill: 'backwards' });
  }
}, { flush: 'pre' });
</script>

<template>
  <div ref="root" class="memory-scene scene stage" :class="{ fading, separated }">
    <div class="mode" aria-hidden="true">
      <span :class="{ on: !separated }"><SiteIcon v-if="!separated" name="done" />Other AI apps</span>
      <span :class="{ on: separated }"><SiteIcon v-if="separated" name="done" />Wildcard</span>
    </div>

    <div class="pool" :class="{ empty: separated }">
      <span class="pool-label"><SiteIcon name="brain" />{{ separated ? 'No shared pool' : 'One memory for every chat' }}</span>
      <div class="chip-row">
        <template v-if="!separated">
          <span v-for="chip in chips" :key="chip.id" :ref="setChip(chip.id)" class="fact">{{ chip.text }}</span>
        </template>
      </div>
    </div>

    <div class="lanes">
      <div v-for="(lane, index) in lanes" :key="lane.who" class="lane">
        <div class="lane-head">
          <ContactAvatar :who="lane.who" :size="32" />
          <span><strong>{{ cast[lane.who].name }}</strong><small>{{ lane.chat }}</small></span>
        </div>
        <div class="vault" :class="{ open: separated }">
          <template v-if="separated">
            <span v-for="chip in chips.filter((c) => c.lane === index)" :key="chip.id" :ref="setChip(chip.id)" class="fact">{{ chip.text }}</span>
          </template>
        </div>
        <div class="lane-chat">
          <Transition name="swap" mode="out-in">
            <div v-if="replyShown(index)" :key="separated ? 'clean' : 'leaked'" class="bubble-row incoming">
              <div class="bubble" :class="{ leaked: !separated }">
                {{ separated ? lane.clean : lane.leaked }}
              </div>
            </div>
          </Transition>
          <span v-if="replyShown(index)" class="verdict" :class="separated ? 'ok' : 'bad'">
            <SiteIcon :name="separated ? 'check' : 'close'" />{{ separated ? 'On topic' : 'Off-topic memory' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-scene { display: flex; flex-direction: column; gap: var(--space-4); padding: clamp(16px, 3vw, 28px); }
.mode {
  align-self: center; display: inline-flex; padding: 4px; border-radius: var(--md-shape-full);
  background: var(--md-surface-container-highest); font: var(--type-label-large);
}
.mode span {
  display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-4); border-radius: var(--md-shape-full);
  color: var(--md-on-surface-variant); transition: background-color var(--md-motion-medium) linear, color var(--md-motion-medium) linear;
}
.mode span.on { background: var(--md-surface); color: var(--md-on-surface); box-shadow: var(--md-elevation-1); }
.mode svg { width: 16px; height: 16px; }
.separated .mode span.on { background: var(--md-primary); color: var(--md-on-primary); }

.pool {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-3); min-height: 116px; padding: var(--space-4);
  border-radius: var(--md-shape-xl); background: color-mix(in srgb, var(--md-error) 7%, var(--md-surface));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--md-error) 26%, transparent);
  transition: background-color 600ms linear, box-shadow 600ms linear, opacity 600ms linear;
}
.pool.empty { background: transparent; box-shadow: inset 0 0 0 1.5px var(--md-outline-variant); opacity: 0.55; }
.pool-label { display: inline-flex; align-items: center; gap: var(--space-1-5); font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.pool-label svg { width: 16px; height: 16px; }
.chip-row { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-2); }
.fact {
  display: inline-flex; align-items: center; height: 30px; padding: 0 var(--space-3); border-radius: var(--md-shape-full);
  background: var(--md-surface); box-shadow: var(--md-elevation-1); font: var(--type-label-medium); font-size: 12.5px; white-space: nowrap;
}

.lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.lane { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; padding: var(--space-3); border-radius: var(--md-shape-xl); background: var(--md-surface); }
.lane-head { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.lane-head span { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.lane-head strong { font: var(--type-title-small); }
.lane-head small { font: var(--type-body-small); color: var(--md-on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vault {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1-5); min-height: 76px; padding: var(--space-2);
  border-radius: var(--md-shape-l); background: var(--md-surface-container); transition: background-color 600ms linear;
}
.vault.open { background: color-mix(in srgb, var(--md-primary) 9%, var(--md-surface-container)); }
.vault .fact { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.lane-chat { display: flex; flex-direction: column; gap: var(--space-2); min-height: 150px; justify-content: flex-end; }
.lane-chat .bubble { max-width: 100%; font-size: 13.5px; line-height: 19px; }
.bubble.leaked { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--md-error) 45%, transparent); }
.verdict { display: inline-flex; align-items: center; gap: var(--space-1); font: var(--type-label-small); }
.verdict svg { width: 14px; height: 14px; }
.verdict.bad { color: var(--md-error); }
.verdict.ok { color: var(--md-success); }
.swap-enter-active { transition: opacity 320ms var(--md-ease), transform 420ms var(--md-ease-decelerate); }
.swap-leave-active { transition: opacity 200ms var(--md-ease); }
.swap-enter-from { opacity: 0; transform: translateY(8px); }
.swap-leave-to { opacity: 0; }

@media (max-width: 720px) {
  .lanes { grid-template-columns: minmax(0, 1fr); }
  .lane { display: grid; grid-template-columns: minmax(0, 1fr); }
  .lane-chat { min-height: 0; }
  .vault { flex-direction: row; flex-wrap: wrap; min-height: 46px; }
}
</style>
