<script setup lang="ts">
// Contact details row for remote timers and alarms (docs/native-remote.md). There is no
// per-chat destination: people just ask in chat and the contact picks one of the phones
// listed here. The sheet shows those phones and, for this account's own iPhone, who else
// may send to it. Turning a phone on happens on that iPhone (Native experiments).
import type { RemoteNativeDevice } from '~/composables/useRemoteNative';

const props = defineProps<{ contactId: string; contactName: string }>();
const remote = useRemoteNative(() => props.contactId);
const open = ref(false);
const error = ref<string | null>(null);

usePolling(() => remote.refresh(), () => 5000);
onMounted(() => { void remote.refresh(); });

const devices = computed(() => remote.state.value.devices);
const owned = computed(() => devices.value.filter(device => device.owned));
const others = computed(() => devices.value.filter(device => !device.owned));
// "Your iPhone" for this account, "Ana’s iPhone" for a shared one; a suffix only when two read the same.
function label(device: RemoteNativeDevice) {
  const base = (d: RemoteNativeDevice) => d.owned ? `Your ${d.name}` : d.name;
  const name = base(device);
  return devices.value.filter(d => base(d) === name).length > 1 ? `${name} · ${device.id.slice(-4)}` : name;
}
const summary = computed(() => {
  if (!remote.state.value.loaded) return 'Loading…';
  if (!devices.value.length) return 'Not set up';
  return devices.value.length === 1 ? label(devices.value[0]!) : `${devices.value.length} phones`;
});
const example = computed(() => {
  const other = others.value[0];
  return other ? `“Set a timer on ${other.name.replace(/’s .*/, '')}’s phone for 10 minutes”` : '“Set a timer for 10 minutes”';
});
function delegated(deviceID: string, participantID: string) {
  return remote.state.value.delegations.some(g => g.deviceID === deviceID && g.participantID === participantID);
}
async function setDelegate(deviceID: string, participantID: string, event: Event) {
  const input = event.target as HTMLInputElement;
  try { await remote.delegate(deviceID, participantID, input.checked); error.value = null; }
  catch (failure) { input.checked = !input.checked; error.value = errorMessage(failure); }
}
async function stop(deviceID: string) {
  try { await remote.revoke(deviceID); error.value = null; }
  catch (failure) { error.value = errorMessage(failure); }
}
</script>

<template>
  <AppListItem icon="timer" opens :value="summary" @click="open = true">Timers and alarms</AppListItem>
  <AppSheet v-if="open" title="Timers and alarms" @close="open = false">
    <AppNotice v-if="error || remote.state.value.error">{{ error || remote.state.value.error }}</AppNotice>
    <template v-if="devices.length">
      <AppListGroup title="Phones you can use" :footer="`Just ask ${contactName} in chat, for example ${example}. ${owned.length ? 'If you don’t name anyone, it goes to your own phone.' : 'Say whose phone you mean.'} The phone gets it as a notification, even while locked, and the chat shows when it’s set.`">
        <AppListItem v-for="device in devices" :key="device.id" plain icon="iphone"
          :supporting="device.owned ? 'Timers and alarms you ask for' : 'They allowed you to send timers and alarms'">
          {{ label(device) }}
        </AppListItem>
      </AppListGroup>
      <template v-for="device in owned" :key="device.id">
        <AppListGroup :title="`Who can send to ${label(device).replace(/^Your /, 'your ')}`"
          footer="They can’t see your chats or anything else on your phone. Turning someone off doesn’t remove alarms they already set.">
          <AppListItem plain icon="person" supporting="From this browser and your other devices">You</AppListItem>
          <AppSwitch
            v-for="participant in remote.state.value.participants" :key="participant.id" icon="person"
            :label="participant.name" :supporting="`Asks ${contactName} in their own chat`"
            :checked="delegated(device.id, participant.id)" :disabled="remote.state.value.mutating"
            @change="setDelegate(device.id, participant.id, $event)"
          />
          <AppListItem danger icon="block" @click="stop(device.id)">Stop receiving on {{ label(device).replace(/^Your /, 'your ') }}</AppListItem>
        </AppListGroup>
      </template>
    </template>
    <p v-else-if="remote.state.value.loaded" class="muted small">
      {{ contactName }} can set timers and alarms on an iPhone that allows it. On your iPhone, open this contact’s Native experiments
      and turn on Receive timers and alarms. People who also chat with {{ contactName }} can let you use their phone the same way.
    </p>
    <template #actions><AppButton @click="open = false">Done</AppButton></template>
  </AppSheet>
</template>
