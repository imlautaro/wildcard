<script setup lang="ts">
// Connectors: MCP servers granted per contact. Lines draw from each contact to
// the tools it may use, then the tool approval flips on.
const { t } = useI18n();
const contacts: CastId[] = ['theo', 'ivy', 'pixel', 'mila'];
const tools: { id: SiteGlyph; name: string }[] = [
  { id: 'linear', name: 'Linear' },
  { id: 'stripe', name: 'Stripe' },
  { id: 'google-calendar', name: 'Google Calendar' },
  { id: 'notion', name: 'Notion' },
  { id: 'github', name: 'GitHub' },
];
// [contact index, tool index]
const links: [number, number][] = [[0, 0], [0, 1], [1, 2], [2, 3], [3, 4]];

const root = ref<HTMLElement | null>(null);
const { step, fading } = useScene(root, [800, 800, 800, 800, 800, 1200], { hold: 4200 });
// Wires are measured from the rendered nodes (and re-measured on resize), so
// they always meet the cards. Without JavaScript the scene shows no wires.
const contactEls: HTMLElement[] = [];
const toolEls: HTMLElement[] = [];
const box = ref({ width: 0, height: 0 });
const paths = ref<string[]>([]);
function measure() {
  const stage = root.value;
  if (!stage) return;
  const origin = stage.getBoundingClientRect();
  box.value = { width: origin.width, height: origin.height };
  paths.value = links.map(([c, t]) => {
    const from = contactEls[c]?.getBoundingClientRect();
    const to = toolEls[t]?.getBoundingClientRect();
    if (!from || !to) return '';
    const x1 = from.right - origin.left; const y1 = from.top + from.height / 2 - origin.top;
    const x2 = to.left - origin.left; const y2 = to.top + to.height / 2 - origin.top;
    const mid = (x1 + x2) / 2;
    return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
  });
}
let resize: ResizeObserver | undefined;
onMounted(() => { measure(); resize = new ResizeObserver(measure); if (root.value) resize.observe(root.value); });
onBeforeUnmount(() => resize?.disconnect());
const toolOn = (index: number) => links.some(([, t], linkIndex) => t === index && step.value > linkIndex);
const contactOn = (index: number) => links.some(([c], linkIndex) => c === index && step.value > linkIndex);
</script>

<template>
  <div ref="root" class="connectors scene stage stage-pad" :class="{ fading }">
    <div class="col">
      <div v-for="(who, index) in contacts" :key="who" :ref="(el) => { contactEls[index] = el as HTMLElement }" class="node contact" :class="{ on: contactOn(index) }">
        <ContactAvatar :who="who" :size="36" />
        <span><strong>{{ cast[who].name }}</strong><small>{{ t(`cast.${who}`) }}</small></span>
      </div>
    </div>
    <span class="gap" aria-hidden="true" />
    <svg v-if="box.width" class="wires" :viewBox="`0 0 ${box.width} ${box.height}`" aria-hidden="true">
      <path v-for="(d, index) in paths" :key="index" :d="d" class="wire" :class="{ drawn: step > index }" pathLength="1" />
    </svg>
    <div class="col">
      <div v-for="(tool, index) in tools" :key="tool.id" :ref="(el) => { toolEls[index] = el as HTMLElement }" class="node tool" :class="{ on: toolOn(index) }">
        <span class="logo"><SiteIcon :name="tool.id" /></span>
        <strong>{{ tool.name }}</strong>
        <span class="state">{{ toolOn(index) ? t('connectorScene.approved') : t('connectorScene.off') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.connectors { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(48px, 0.6fr) minmax(0, 1fr); align-items: stretch; }
.col { display: flex; flex-direction: column; justify-content: space-around; min-height: 340px; }
.node {
  display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-2) var(--space-3); border-radius: var(--md-shape-l);
  background: var(--md-surface); opacity: 0.55; transition: opacity 400ms linear, box-shadow 400ms linear;
}
.node.on { opacity: 1; box-shadow: var(--md-elevation-1); }
.node span { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.node strong { font: var(--type-title-small); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node small { font: var(--type-body-small); color: var(--md-on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.logo { display: grid !important; place-items: center; width: 32px; height: 32px; flex: none; border-radius: var(--md-shape-s); background: var(--md-surface-container-low); }
:root[data-theme="dark"] .logo { background: #f4f4f4; }
.logo svg { width: 20px; height: 20px; }
.tool strong { flex: 1; font-size: 13px; }
.state { flex: none; padding: 2px var(--space-2); border-radius: var(--md-shape-full); font: var(--type-label-small); background: var(--md-surface-container-high); color: var(--md-on-surface-variant); }
.tool.on .state { background: var(--md-success-container); color: var(--md-on-success-container); }
.wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.wire { fill: none; stroke: var(--md-primary); stroke-width: 2; stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 800ms var(--md-ease); opacity: 0.85; }
.wire.drawn { stroke-dashoffset: 0; }
@media (max-width: 560px) {
  .connectors { grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); padding: var(--space-3); }
  .node small, .state { display: none; }
  .node { padding: var(--space-2); gap: var(--space-2); }
}
</style>
