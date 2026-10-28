<script setup lang="ts">
useHead({ title: 'Native experiments' });
</script>
<template>
  <PageBar title="Native experiments" back="/account" always-back />
  <div class="page"><div class="page-inner">
    <h2>Try it on your iPhone</h2>
    <p>In the iOS app, open a contact → Native experiments, or Account → Native experiments. Enable the contact on that device, then request an action in its private chat.</p>
    <ul>
      <li>Focus sessions and guided recipes in Live Activities and Dynamic Island.</li>
      <li>System timers and alarms, Calendar events, and Reminders, including arrival and departure reminders.</li>
      <li>Spoken responses, Siri and Shortcuts, Action button shortcuts, and a Home Screen contact widget.</li>
      <li>Shared drafts from Safari, Photos or Files, and contact links on NFC tags.</li>
    </ul>
    <p>Timers and alarms run without extra app confirmation on the requesting iPhone while Wildcard is open. In Native experiments, choose other tools under Run without confirmation or turn automatic execution off. Calendar and location reminders still require review; older requests remain manual. iOS may request permission the first time. Enabling a shared contact does not give other participants access to your device or system data.</p>
    <p>On iPhone, active timers, alarms, focus sessions, recipes and spoken responses appear inside Wildcard. Timer cards show the system countdown when available, with pause, resume and cancel controls. Each native request also has an operation receipt in its chat. After the backend update, the contact briefly waits for the device receipt before confirming automatic execution; an unconfirmed request is never described as completed.</p>
    <p>These Apple frameworks require the native iOS app. This browser does not advertise native tools, execute phone actions or import another device's requests. Contact links also open existing authorized conversations on the web.</p>
    <p>Saved Calendar and Reminders items and scheduled system alarms remain in iOS until you remove them. Manage Wildcard alarms in the iOS app’s Native experiments screen; they are not added to Apple’s Clock app. Shared drafts are stored on the device and are sent only when you tap Send.</p>
  </div></div>
</template>
