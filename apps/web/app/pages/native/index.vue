<script setup lang="ts">
useHead({ title: 'Native experiments' });
const capabilities = [
  { kind: 'focus', icon: 'target', title: 'Live Activities', text: 'Focus sessions and guided recipes in Live Activities and Dynamic Island.' },
  { kind: 'timer', icon: 'alarm', title: 'System tools', text: 'System timers and alarms, Calendar events, and Reminders, including arrival and departure reminders.' },
  { kind: 'speech', icon: 'speaker', title: 'Voice and shortcuts', text: 'Spoken responses, Siri and Shortcuts, Action button shortcuts, and a Home Screen contact widget.' },
  { kind: 'location', icon: 'nfc', title: 'Sharing and NFC', text: 'Shared drafts from Safari, Photos or Files, and contact links on NFC tags.' },
] as const;
</script>
<template>
  <PageBar title="Native experiments" back="/account" always-back />
  <div class="page"><div class="page-inner">
    <div class="identity">
      <span class="native-glyph" style="width: 64px; height: 64px; border-radius: 16px"><AppIcon name="iphone" style="width: 34px; height: 34px" /></span>
      <h2 style="font-size: 22px; font-weight: 800">Try it on your iPhone</h2>
      <p class="muted" style="margin: 0; text-align: center; max-width: 460px">In the iOS app, open a contact → Native experiments, or Account → Native experiments. Enable the contact on that device, then request an action in its private chat.</p>
    </div>

    <div class="group-title">What you can try</div>
    <div class="group">
      <div v-for="item in capabilities" :key="item.title" class="native-row">
        <span class="native-glyph" :data-kind="item.kind"><AppIcon :name="item.icon" /></span>
        <div><strong>{{ item.title }}</strong><p>{{ item.text }}</p></div>
      </div>
    </div>

    <div class="group-title">Automatic execution</div>
    <div class="group"><div class="text-block">
      <p>Timers and alarms run without extra app confirmation on the requesting iPhone while Wildcard is open. In Native experiments, choose other tools under Run without confirmation or turn automatic execution off. Calendar and location reminders still require review; older requests remain manual. iOS may request permission the first time. Enabling a shared contact does not give other participants access to your device or system data.</p>
    </div></div>

    <div class="group-title">Live status and receipts</div>
    <div class="group"><div class="text-block">
      <p>On iPhone, active timers, alarms, focus sessions, recipes and spoken responses appear inside Wildcard. Timer cards show the system countdown when available, with pause, resume and cancel controls. Each native request also has an operation receipt in its chat. After the backend update, the contact briefly waits for the device receipt before confirming automatic execution; an unconfirmed request is never described as completed.</p>
    </div></div>

    <div class="group-title">From this browser</div>
    <div class="group">
      <div class="native-row">
        <span class="native-glyph" data-kind="timer"><AppIcon name="timer" /></span>
        <div><strong>Remote timers and alarms</strong><p>To request a timer or alarm from this browser, enable Allow remote timers and alarms in the iPhone contact’s Native experiments, then choose that phone in the web chat. A visible push lets the notification extension attempt scheduling while the phone is locked or the main app is closed. Requests expire after one minute; the chat shows the device receipt.</p></div>
      </div>
      <div class="text-block">
        <p>This experimental path requires updated backend, app and extension signing, and has not yet been verified on our signed device. Autonomous bot initiative cannot trigger it yet.</p>
        <p>These Apple frameworks require the native iOS app. This browser does not execute Apple frameworks locally. It exposes remote timer/alarm tools only when you explicitly select your linked iPhone. Contact links also open existing authorized conversations on the web.</p>
      </div>
    </div>
    <p class="group-footer" style="padding-top: 8px">Saved Calendar and Reminders items and scheduled system alarms remain in iOS until you remove them. Manage Wildcard alarms in the iOS app’s Native experiments screen; they are not added to Apple’s Clock app. Shared drafts are stored on the device and are sent only when you tap Send.</p>
  </div></div>
</template>
