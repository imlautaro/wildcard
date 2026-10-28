import type { OnboardingInput, OnboardingStatus, OnboardingOption } from '../../../../shared/onboarding';
type Options = { countries: OnboardingOption[]; languages: OnboardingOption[]; styles: OnboardingOption[] };
const options = ref<Options | null>(null);
const snapshot = ref<OnboardingStatus | null>(null);
const draft = reactive<OnboardingInput>({ name: '', gender: 'male', language: 'en', country: '', style: 'cartoon', sharedMemoryConsent: false });
let revision = 0;
let loading: Promise<void> | null = null;
let submitting: Promise<void> | null = null;
const busy = ref(false);
registerSessionReset(() => {
  revision++; loading = null; submitting = null; busy.value = false; options.value = null; snapshot.value = null;
  Object.assign(draft, { name: '', gender: 'male', language: 'en', country: '', style: 'cartoon', sharedMemoryConsent: false });
});
async function refresh() {
  if (busy.value) return;
  const current = revision;
  loading ??= Promise.all([
    options.value ? Promise.resolve(options.value) : api<Options>('onboarding/options'),
    api<OnboardingStatus>('onboarding'),
  ]).then(([choices, state]) => {
    if (current !== revision) return;
    options.value = choices;
    snapshot.value = state;
    if (state.input) Object.assign(draft, state.input);
  }).finally(() => { if (current === revision) loading = null; });
  await loading;
}
async function submit() {
  if (submitting) return submitting;
  const current = ++revision;
  loading = null;
  busy.value = true;
  submitting = api<OnboardingStatus>('onboarding', { json: { ...draft } }).then(state => {
    if (current !== revision) return;
    snapshot.value = state;
    if (state.input) Object.assign(draft, state.input);
  }).finally(() => { if (current === revision) { submitting = null; busy.value = false; } });
  await submitting;
}
export function useOnboarding() { return { options: readonly(options), snapshot: readonly(snapshot), draft, busy: readonly(busy), refresh, submit }; }
