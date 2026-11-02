<script setup lang="ts">
// A phone-sized screen for scenes (1:1.45, see --phone-ratio in site.css): optional
// caption above, the front camera dot and a chat header (avatar, name, status) as
// in the app's conversation bar.
withDefaults(defineProps<{
  caption?: string;
  title?: string;
  status?: string;
  who?: CastId;
  person?: PersonId;
  group?: CastId[];
}>(), { caption: undefined, title: undefined, status: undefined, who: undefined, person: undefined, group: undefined });
</script>

<template>
  <figure class="phone">
    <figcaption v-if="caption" class="phone-caption">{{ caption }}</figcaption>
    <div class="phone-body">
      <span class="phone-camera" aria-hidden="true" />
      <div class="phone-top" aria-hidden="true" />
      <div v-if="title" class="phone-bar">
        <SiteIcon name="chevron" class="back" />
        <span v-if="group" class="stack">
          <ContactAvatar v-for="g in group" :key="g" :who="g" :size="26" />
        </span>
        <ContactAvatar v-else :who="who" :person="person" :size="34" />
        <span class="phone-title">
          <strong>{{ title }}</strong>
          <small v-if="status">{{ status }}</small>
        </span>
      </div>
      <div class="phone-screen"><slot /></div>
    </div>
  </figure>
</template>

<style scoped>
.phone { margin: 0; display: flex; flex-direction: column; align-items: center; gap: var(--space-3); min-width: 0; }
.phone-caption {
  display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3);
  border-radius: var(--md-shape-full); background: var(--md-surface-container-highest); color: var(--md-on-surface-variant);
  font: var(--type-label-medium); letter-spacing: var(--tracking-label);
}
.phone-body {
  position: relative; display: flex; flex-direction: column; width: 100%; max-width: var(--phone-width, 340px); aspect-ratio: var(--phone-ratio);
  overflow: hidden; border-radius: var(--phone-radius); background: var(--md-surface);
  box-shadow: 0 0 0 8px var(--md-surface-container-highest), 0 0 0 9px var(--stage-edge), var(--md-elevation-3);
}
.phone-top { flex: none; height: 52px; }
.phone-bar {
  display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-4) var(--space-2) var(--space-2);
  border-bottom: 1px solid color-mix(in srgb, var(--md-on-surface) 6%, transparent);
}
.back { width: 20px; height: 20px; transform: scaleX(-1); color: var(--md-primary); }
.stack { display: inline-flex; }
.stack > * + * { margin-left: -9px; box-shadow: 0 0 0 2px var(--md-surface); }
.phone-title { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.phone-title strong { font: var(--type-title-small); font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phone-title small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.phone-screen { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; padding: var(--space-3); }
</style>
