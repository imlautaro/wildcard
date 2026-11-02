<script setup lang="ts">
// Self-hosting: the provisioning steps from docs/infrastructure.md typed into a
// terminal, ending with the automatic release from Workers Builds.
const lines: { kind: 'cmd' | 'ok' | 'note'; text: string }[] = [
  { kind: 'cmd', text: 'git clone https://github.com/imlautaro/wildcard && cd wildcard' },
  { kind: 'cmd', text: 'npm ci && npx wrangler login' },
  { kind: 'cmd', text: 'npm run infra:provision' },
  { kind: 'ok', text: 'D1 database ready · binding DB' },
  { kind: 'cmd', text: 'npm run infra:photos' },
  { kind: 'ok', text: 'R2 bucket ready · binding CONTACT_PHOTOS' },
  { kind: 'note', text: '# Add META_API_KEY as a secret, connect Workers Builds' },
  { kind: 'cmd', text: 'git push origin main' },
  { kind: 'ok', text: 'Workers Builds: migrations applied, wildcard-api released' },
  { kind: 'ok', text: 'wildcard-web released · your Wildcard is live' },
];
const root = ref<HTMLElement | null>(null);
const { step, fading } = useScene(root, lines.map((line) => (line.kind === 'cmd' ? 900 : 600)), { hold: 5000 });
</script>

<template>
  <div ref="root" class="terminal scene" :class="{ fading }">
    <div class="term-bar" aria-hidden="true"><i /><i /><i /><span>~/wildcard</span></div>
    <pre class="term-body"><code><template v-for="(line, index) in lines" :key="index"><span v-if="step > index" class="line" :class="line.kind"><span v-if="line.kind === 'cmd'" class="prompt">$ </span><span v-else-if="line.kind === 'ok'" class="tick">✓ </span><span class="text" :class="{ 'typed-cmd': line.kind === 'cmd' }" :style="{ '--chars': line.text.length }">{{ line.text }}</span>
</span></template><span class="cursor" /></code></pre>
  </div>
</template>

<style scoped>
.terminal { overflow: hidden; border-radius: var(--md-shape-xl); background: #0f1115; color: #e6e6e6; box-shadow: var(--md-elevation-3); }
.term-bar { display: flex; align-items: center; gap: 7px; height: 40px; padding: 0 var(--space-4); background: #1a1d23; }
.term-bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57; }
.term-bar i:nth-child(2) { background: #febc2e; } .term-bar i:nth-child(3) { background: #28c840; }
.term-bar span { margin-left: var(--space-3); font: var(--type-label-medium); color: #8a8f98; }
.term-body { min-height: 330px; margin: 0; padding: var(--space-4) var(--space-5) var(--space-5); overflow-x: auto; font: 13.5px / 1.75 var(--font-mono); white-space: pre-wrap; word-break: break-all; }
.line { display: block; }
.prompt { color: #7aa2ff; }
.tick { color: #4ade80; }
.ok { color: #b9f6ca; }
.note { color: #8a8f98; }
.typed-cmd { display: inline-block; animation: type 700ms steps(var(--chars)) both; }
@keyframes type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.cursor { display: inline-block; width: 8px; height: 16px; vertical-align: -3px; background: #7aa2ff; animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
</style>
