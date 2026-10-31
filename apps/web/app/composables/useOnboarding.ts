import type { OnboardingInput, OnboardingStatus, OnboardingOption } from '../../../../shared/onboarding';
type Options = { countries: OnboardingOption[]; languages: OnboardingOption[]; styles: OnboardingOption[] };
const options = ref<Options | null>(null);
const snapshot = ref<OnboardingStatus | null>(null);
const draft = reactive<OnboardingInput>({ name: '', age: null, gender: 'male', language: 'en', country: '', style: 'cartoon', createGroup: true, circleType: 'friends', occupation: '', sharedMemoryConsent: false, createContacts: true, customStyle: '' });
let revision = 0;
let loading: Promise<void> | null = null;
let submitting: Promise<void> | null = null;
const busy = ref(false);
registerSessionReset(() => {
  revision++; loading = null; submitting = null; busy.value = false; options.value = null; snapshot.value = null;
  Object.assign(draft, { name: '', age: null, gender: 'male', language: 'en', country: '', style: 'cartoon', createGroup: true, circleType: 'friends', occupation: '', sharedMemoryConsent: false, createContacts: true, customStyle: '' });
});
async function refresh() {
  if (busy.value) return;
  const current = revision;
  loading ??= Promise.all([
    options.value ? Promise.resolve(options.value) : api<Options>('onboarding/options', { query: { custom: '1' } }),
    api<OnboardingStatus>('onboarding'),
  ]).then(([choices, state]) => {
    if (current !== revision) return;
    options.value = choices;
    snapshot.value = state;
    if (state.input) Object.assign(draft, { age: null, createGroup: true, circleType: 'friends', occupation: '' }, state.input);
  }).finally(() => { if (current === revision) loading = null; });
  await loading;
}
async function submit() {
  if (submitting) return submitting;
  const current = ++revision;
  loading = null;
  busy.value = true;
  const body = draft.createContacts === false
    ? { ...draft, createGroup: false, circleType: 'friends', occupation: '' }
    : { ...draft, occupation: draft.circleType === 'friends' ? '' : draft.occupation, customStyle: draft.style === 'custom' ? draft.customStyle : '' };
  submitting = api<OnboardingStatus>('onboarding', { json: body }).then(state => {
    if (current !== revision) return;
    snapshot.value = state;
    if (state.input) Object.assign(draft, { age: null, createGroup: true, circleType: 'friends', occupation: '' }, state.input);
  }).finally(() => { if (current === revision) { submitting = null; busy.value = false; } });
  await submitting;
}
// Progressive setup (docs/onboarding.md#progressive-setup): the chat list follows the
// circle while its contacts are created, without loading the onboarding options.
let statusRequest: Promise<void> | null = null;
async function refreshStatus() {
  const current = revision;
  statusRequest ??= api<OnboardingStatus>('onboarding').then(state => {
    if (current === revision) snapshot.value = state;
  }).catch(() => { /* Keeps the last known status. */ }).finally(() => { statusRequest = null; });
  await statusRequest;
}
// Retrying reuses the saved preferences; the body is ignored for an existing setup.
async function retry() {
  const current = ++revision;
  const state = await api<OnboardingStatus>('onboarding', { json: {} });
  if (current === revision) snapshot.value = state;
}
export function circleRunning(state: OnboardingStatus | null) { return state?.status === 'queued' || state?.status === 'generating'; }
export function useOnboarding() { return { options: readonly(options), snapshot: readonly(snapshot), draft, busy: readonly(busy), refresh, submit, refreshStatus, retry }; }
