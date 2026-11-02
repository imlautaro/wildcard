<script setup lang="ts">
// Cycles the layer's appearance preference: System → Light → Dark. The choice is
// stored per browser under the same key as the web app (on a different origin).
const { preference, setPreference } = useTheme();
const order = ['system', 'light', 'dark'] as const;
const glyph = { system: 'monitor', light: 'sun', dark: 'moon' } as const;
const { t } = useI18n();
const modes = computed(() => ({ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }));
const label = computed(() => t('theme.label', { mode: modes.value[preference.value] }));
const mounted = ref(false);
onMounted(() => { mounted.value = true; });
function next() {
  setPreference(order[(order.indexOf(preference.value) + 1) % order.length]!);
}
</script>

<template>
  <button type="button" class="icon-button" :aria-label="label" :title="label" @click="next">
    <SiteIcon :name="mounted ? glyph[preference] : 'monitor'" />
  </button>
</template>
