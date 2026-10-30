<script setup lang="ts">
const props = defineProps<{ base: string }>();
const { value, busy, error, refresh, setEnabled, reset } = useConversationLearning(() => props.base);
watch(() => props.base, () => { void refresh(false); }, { immediate: true });
const labels = { observation: 'Observation', adjustment: 'Conversation adjustment', question: 'Optional question' };
const back = computed(() => `/${props.base}/${props.base.startsWith('contacts/') ? 'edit' : 'members'}`);
function clear() {
  if (window.confirm('Reset learning about you in this chat? Contacts will learn again from new messages. Existing chat messages and factual memories stay available.')) void reset();
}
</script>

<template>
  <PageBar title="Conversation learning" :back="back" always-back>
    <button type="button" class="icon-button" aria-label="Refresh learning" :disabled="busy" @click="refresh()"><AppIcon name="refresh" /></button>
  </PageBar>
  <section class="learning-panel">
    <p class="muted">Contacts learn your interests and conversational preferences, notice their own repetition, and keep optional questions for relevant moments. Learning stays in this chat. In a group, this screen shows only learning about you, separately for each contact.</p>
    <p class="muted">You can correct a preference in conversation. Learning does not enable spontaneous messages or change a contact's configured personality.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!value && busy" role="status">Loading…</p>
    <template v-if="value">
      <label class="setting-row"><span>Learn from my messages</span><input type="checkbox" role="switch" :checked="value.enabled" :disabled="busy" @change="setEnabled(($event.target as HTMLInputElement).checked)"></label>
      <p class="muted">Turning this off clears conversation learning about you. Turning it on starts with new messages. Factual memory has its own rules.</p>
      <p v-if="!value.profiles.some(profile => profile.items.length)" class="muted">Nothing learned yet. Contacts review recent exchanges as the conversation develops.</p>
      <article v-for="profile in value.profiles" :key="profile.agentID">
        <h2>{{ profile.agentName }}</h2>
        <p v-if="profile.reviewedAt" class="muted">Last reviewed {{ new Date(profile.reviewedAt).toLocaleString() }}</p>
        <div v-for="item in profile.items" :key="item.key" class="learning-item">
          <small>{{ labels[item.kind] }} · {{ item.confidence === 'supported' ? 'Repeated evidence' : 'Tentative' }}<template v-if="item.kind === 'question'"> · {{ item.status }}</template></small>
          <p>{{ item.text }}</p>
          <p v-if="item.answer">{{ item.answer }}</p>
          <details><summary>Context and evidence</summary>
            <p v-if="item.opportunity">May fit: {{ item.opportunity }}</p><p v-if="item.avoid">Avoid: {{ item.avoid }}</p>
            <blockquote v-for="(source, index) in item.evidence" :key="index">{{ source.side === 'human' ? 'You' : profile.agentName }}: {{ source.quote }}</blockquote>
          </details>
        </div>
      </article>
      <button type="button" :disabled="busy" @click="clear">Reset learning about me</button>
    </template>
  </section>
</template>

<style scoped>
.learning-panel { max-width: 48rem; margin: 0 auto; padding: 1.5rem; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.learning-panel p { line-height: 1.5; }
.learning-item { padding: 1rem 0; border-bottom: 1px solid var(--md-outline-variant); }
.learning-item small, .muted { color: var(--md-on-surface-variant); }
details { font-size: .9rem; } blockquote { margin: .75rem 0; padding-left: .75rem; border-left: 2px solid var(--md-outline-variant); }
</style>
