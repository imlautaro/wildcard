<template>
  <AppEmptyState icon="chat" title="Select a chat" text="Choose a conversation, or open Contacts to start a new one.">
    <template #actions><AppButton to="/contacts" variant="tonal">Open Contacts</AppButton></template>
  </AppEmptyState>
</template>
