<script setup lang="ts">
useHead({ title: 'Native experiments' });
const capabilities = [
  // Focus sessions, guided recipes, spoken responses and NFC were deprecated on 2026-10-30.
  { kind: 'timer', icon: 'alarm', title: 'System tools', text: 'System timers and alarms, Calendar events, and Reminders, including arrival and departure reminders.' },
  { kind: 'default', icon: 'iphone', title: 'Shortcuts and widgets', text: 'Siri and Shortcuts, Action button shortcuts, and a Home Screen contact widget.' },
  { kind: 'default', icon: 'share', title: 'Sharing', text: 'Shared drafts from Safari, Photos or Files, and authorized contact links.' },
] as const;
// Longer explanations open in a sheet from a row instead of stacked paragraphs.
const topics = [
  { title: 'Automatic execution', icon: 'bolt', paragraphs: ['Timers and alarms run without extra app confirmation on the requesting iPhone while Wildcard is open. In Native experiments, choose other tools under Run without confirmation or turn automatic execution off. Calendar and location reminders still require review; older requests remain manual. iOS may request permission the first time. Enabling a shared contact does not give other participants access to your device or system data.'] },
  { title: 'Live status and receipts', icon: 'check', paragraphs: ['On iPhone, active timers and alarms appear inside Wildcard. Timer cards show the system countdown when available, with pause, resume and cancel controls. Each native request also has an operation receipt in its chat. After the backend update, the contact briefly waits for the device receipt before confirming automatic execution; an unconfirmed request is never described as completed.'] },
  { title: 'Remote timers and alarms', icon: 'timer', paragraphs: [
    'To request a timer or alarm from this browser, enable Allow remote timers and alarms in the iPhone contact’s Native experiments, then choose that phone in the web chat. A visible push lets the notification extension attempt scheduling while the phone is locked or the main app is closed. Requests expire after one minute; the chat shows the device receipt.',
    'This experimental path requires updated backend, app and extension signing, and has not yet been verified on our signed device. Autonomous bot initiative cannot trigger it yet.',
    'These Apple frameworks require the native iOS app. This browser does not execute Apple frameworks locally. It exposes remote timer/alarm tools only when you explicitly select your linked iPhone. Contact links also open existing authorized conversations on the web.',
  ] },
  { title: 'What stays on your iPhone', icon: 'iphone', paragraphs: ['Saved Calendar and Reminders items and scheduled system alarms remain in iOS until you remove them. Manage Wildcard alarms in the iOS app’s Native experiments screen; they are not added to Apple’s Clock app. Shared drafts are stored on the device and are sent only when you tap Send.'] },
] as const;
const topic = ref<(typeof topics)[number] | null>(null);
</script>
<template>
  <PageBar title="Native experiments" back="/account" always-back />
  <div class="page"><div class="page-inner">
    <div class="identity">
      <span class="native-glyph" style="width: 64px; height: 64px; border-radius: 16px"><AppIcon name="iphone" style="width: 34px; height: 34px" /></span>
      <h2 class="identity-title">Try it on your iPhone</h2>
      <p class="muted" style="margin: 0; text-align: center; max-width: 460px">Enable a contact in the iOS app’s Native experiments, then ask in its private chat.</p>
    </div>

    <div class="group-title">What you can try</div>
    <div class="group">
      <div v-for="item in capabilities" :key="item.title" class="native-row">
        <span class="native-glyph" :data-kind="item.kind"><AppIcon :name="item.icon" /></span>
        <div><strong>{{ item.title }}</strong><p>{{ item.text }}</p></div>
      </div>
    </div>

    <div class="group-title">Learn more</div>
    <div class="group">
      <button v-for="item in topics" :key="item.title" type="button" class="button-row opens" @click="topic = item"><AppIcon :name="item.icon" />{{ item.title }}</button>
    </div>
    <AppSheet v-if="topic" :title="topic.title" @close="topic = null">
      <p v-for="paragraph in topic.paragraphs" :key="paragraph" class="sheet-text">{{ paragraph }}</p>
    </AppSheet>
  </div></div>
</template>
