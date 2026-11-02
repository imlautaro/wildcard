<script setup lang="ts">
// Contact details row for remote timers and alarms (docs/native-remote.md). There is no
// per-chat destination: people just ask in chat and the contact picks one of the phones
// listed here. The sheet shows those phones and, for this account's own iPhone, who else
// may send to it. Turning a phone on happens on that iPhone (Native experiments).
import type { RemoteNativeDevice } from '~/composables/useRemoteNative';

const props = defineProps<{ contactId: string; contactName: string }>();
const { t } = useI18n();
const remote = useRemoteNative(() => props.contactId);
const open = ref(false);
const error = ref<string | null>(null);

usePolling(() => remote.refresh(), () => 5000);
onMounted(() => { void remote.refresh(); });

const devices = computed(() => remote.state.value.devices);
const owned = computed(() => devices.value.filter(device => device.owned));
const others = computed(() => devices.value.filter(device => !device.owned));
// The device name plus an id suffix only when two devices read the same ("Your iPhone"
// for this account's own, "Ana’s iPhone" for a shared one).
function deviceName(device: RemoteNativeDevice) {
  const same = devices.value.filter(d => d.owned === device.owned && d.name === device.name).length > 1;
  return same ? `${device.name} · ${device.id.slice(-4)}` : device.name;
}
function label(device: RemoteNativeDevice) {
  return device.owned ? t('contacts.phones.yourDevice', { name: deviceName(device) }) : deviceName(device);
}
const summary = computed(() => {
  if (!remote.state.value.loaded) return t('common.loading');
  if (!devices.value.length) return t('contacts.phones.notSetUp');
  return devices.value.length === 1 ? label(devices.value[0]!) : t('contacts.phones.phoneCount', devices.value.length);
});
const example = computed(() => {
  const other = others.value[0];
  return other ? t('contacts.phones.exampleOther', { owner: other.name.replace(/’s .*/, '') }) : t('contacts.phones.exampleOwn');
});
const footer = computed(() => t(owned.value.length ? 'contacts.phones.footerOwned' : 'contacts.phones.footerOthers', { name: props.contactName, example: example.value }));
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
  <AppListItem icon="timer" opens :value="summary" @click="open = true">{{ $t('contacts.phones.title') }}</AppListItem>
  <AppSheet v-if="open" :title="$t('contacts.phones.title')" @close="open = false">
    <AppNotice v-if="error || remote.state.value.error">{{ error || remote.state.value.error }}</AppNotice>
    <template v-if="devices.length">
      <AppListGroup :title="$t('contacts.phones.phonesYouCanUse')" :footer="footer">
        <AppListItem v-for="device in devices" :key="device.id" plain icon="iphone"
          :supporting="device.owned ? $t('contacts.phones.ownedSupporting') : $t('contacts.phones.sharedSupporting')">
          {{ label(device) }}
        </AppListItem>
      </AppListGroup>
      <template v-for="device in owned" :key="device.id">
        <AppListGroup :title="$t('contacts.phones.whoCanSend', { name: deviceName(device) })"
          :footer="$t('contacts.phones.whoFooter')">
          <AppListItem plain icon="person" :supporting="$t('contacts.phones.youSupporting')">{{ $t('common.you') }}</AppListItem>
          <AppSwitch
            v-for="participant in remote.state.value.participants" :key="participant.id" icon="person"
            :label="participant.name" :supporting="$t('contacts.phones.asks', { name: contactName })"
            :checked="delegated(device.id, participant.id)" :disabled="remote.state.value.mutating"
            @change="setDelegate(device.id, participant.id, $event)"
          />
          <AppListItem danger icon="block" @click="stop(device.id)">{{ $t('contacts.phones.stop', { name: deviceName(device) }) }}</AppListItem>
        </AppListGroup>
      </template>
    </template>
    <p v-else-if="remote.state.value.loaded" class="muted small">
      {{ $t('contacts.phones.empty', { name: contactName }) }}
    </p>
    <template #actions><AppButton @click="open = false">{{ $t('common.done') }}</AppButton></template>
  </AppSheet>
</template>
