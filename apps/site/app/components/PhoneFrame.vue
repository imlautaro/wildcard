<script setup lang="ts">
// A phone-sized screen for scenes (1:1.45, see --phone-ratio in site.css): optional
// caption above, the front camera and, for a chat (`title`), the app's
// conversation bar on top and its message composer at the bottom.
withDefaults(defineProps<{
  caption?: string;
  title?: string;
  status?: string;
  who?: CastId;
  person?: PersonId;
  group?: CastId[];
}>(), { caption: undefined, title: undefined, status: undefined, who: undefined, person: undefined, group: undefined });
const { t } = useI18n();
</script>

<template>
  <figure class="phone">
    <figcaption v-if="caption" class="phone-caption">{{ caption }}</figcaption>
    <div class="phone-body">
      <span class="phone-camera" aria-hidden="true" />
      <div v-if="!title" class="phone-top" aria-hidden="true" />
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
      <div v-if="title" class="phone-composer" aria-hidden="true">
        <span class="composer-icon"><AppIcon name="attach" /></span>
        <span class="composer-input">{{ t('phone.message') }}</span>
        <span class="composer-mic"><AppIcon name="mic" /></span>
      </div>
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
  box-shadow: 0 0 0 8px #000, 0 0 0 9px #000, var(--md-elevation-3);
}
.phone-top { flex: none; height: calc(var(--phone-camera-inset) + var(--phone-camera-size) + var(--space-2)); }
/* The chat bar shares the camera's row: same height, centered on it. */
.phone-bar {
  display: flex; align-items: center; gap: var(--space-2); flex: none;
  min-height: calc(2 * var(--phone-camera-inset) + var(--phone-camera-size));
  padding: 0 calc(2 * var(--phone-camera-inset) + var(--phone-camera-size)) 0 var(--space-2);
  border-bottom: 1px solid color-mix(in srgb, var(--md-on-surface) 6%, transparent);
}
.back { width: 20px; height: 20px; transform: scaleX(-1); color: var(--md-primary); }
.stack { display: inline-flex; }
.stack > * + * { margin-left: -9px; box-shadow: 0 0 0 2px var(--md-surface); }
.phone-title { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.phone-title strong { font: var(--type-title-small); font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phone-title small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.phone-screen { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; padding: var(--space-3); }
.phone-composer { display: flex; align-items: center; gap: var(--space-1); flex: none; padding: var(--space-1-5) var(--space-2) var(--space-3); }
.composer-icon { display: grid; place-items: center; width: 36px; height: 36px; flex: none; color: var(--md-on-surface-variant); }
.composer-icon svg { width: 22px; height: 22px; }
.composer-input {
  flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; padding: 0 var(--space-4); border-radius: 20px;
  background: var(--md-surface-container-high); color: var(--md-on-surface-variant); font: var(--type-body-medium); font-size: 15px;
}
.composer-mic { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border-radius: 50%; background: var(--md-primary); color: var(--md-on-primary); }
.composer-mic svg { width: 20px; height: 20px; }
</style>
