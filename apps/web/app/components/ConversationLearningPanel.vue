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
    <AppIconButton icon="refresh" label="Refresh learning" :disabled="busy" @click="refresh()" />
  </PageBar>
  <div class="page">
    <section class="page-inner">
      <p class="intro">Contacts learn your interests and conversational preferences, notice their own repetition, and keep optional questions for relevant moments. Learning stays in this chat. In a group, this screen shows only learning about you, separately for each contact.</p>
      <p class="intro">You can correct a preference in conversation. Learning does not enable spontaneous messages or change a contact's configured personality.</p>
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppLoading v-if="!value && busy" fill />
      <template v-if="value">
        <AppListGroup footer="Turning this off clears conversation learning about you. Turning it on starts with new messages. Factual memory has its own rules.">
          <AppSwitch label="Learn from my messages" :checked="value.enabled" :disabled="busy" @change="setEnabled(($event.target as HTMLInputElement).checked)" />
        </AppListGroup>
        <p v-if="!value.profiles.some(profile => profile.items.length)" class="intro">Nothing learned yet. Contacts review recent exchanges as the conversation develops.</p>
        <AppListGroup v-for="profile in value.profiles" :key="profile.agentID"
                      :footer="profile.reviewedAt ? `Last reviewed ${new Date(profile.reviewedAt).toLocaleString()}` : undefined">
          <template #title><h2>{{ profile.agentName }}</h2></template>
          <div v-for="item in profile.items" :key="item.key" class="learning-item">
            <small>{{ labels[item.kind] }} · {{ item.confidence === 'supported' ? 'Repeated evidence' : 'Tentative' }}<template v-if="item.kind === 'question'"> · {{ item.status }}</template></small>
            <p>{{ item.text }}</p>
            <p v-if="item.answer">{{ item.answer }}</p>
            <details><summary>Context and evidence</summary>
              <p v-if="item.opportunity">May fit: {{ item.opportunity }}</p><p v-if="item.avoid">Avoid: {{ item.avoid }}</p>
              <blockquote v-for="(source, index) in item.evidence" :key="index">{{ source.side === 'human' ? 'You' : profile.agentName }}: {{ source.quote }}</blockquote>
            </details>
          </div>
        </AppListGroup>
        <AppListGroup>
          <AppListItem icon="x-circle" danger :disabled="busy" @click="clear">Reset learning about me</AppListItem>
        </AppListGroup>
      </template>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-3); padding: 0 var(--space-4); color: var(--md-on-surface-variant); font: var(--type-body-medium); line-height: 1.5; }
.group-title h2 { font: inherit; letter-spacing: inherit; }
.learning-item { padding: var(--space-3) var(--space-4); font: var(--type-body-medium); line-height: 1.5; }
.learning-item small { font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.learning-item p { margin: var(--space-1) 0 0; }
.learning-item details { margin-top: var(--space-1); color: var(--md-on-surface-variant); }
.learning-item blockquote { margin: var(--space-3) 0; padding-left: var(--space-3); border-left: 2px solid var(--md-outline-variant); }
</style>
