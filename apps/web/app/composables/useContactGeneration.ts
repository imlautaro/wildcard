import type { ContactGenerationInput, ContactGenerationJob } from '../../../../shared/contact-generation';
const initial = (): ContactGenerationInput => ({ age: 25, gender: 'female', style: 'cartoon', customStyle: '', purpose: 'friends', language: 'en', country: '' });
const draft = reactive(initial());
const job = ref<ContactGenerationJob | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
// The contact a job submitted or watched in this session just created; the form opens its chat.
const created = ref<string | null>(null);
let initialized = false, revision = 0;
let request: Promise<void> | null = null;
let submissionID: string | null = null;
let dismissedID: string | null = null;
registerSessionReset(() => {
  revision++; request = null; initialized = false; submissionID = null; dismissedID = null;
  Object.assign(draft, initial()); job.value = null; busy.value = false; error.value = null; created.value = null;
});
// A finished job is never a form state: it opens the new contact when this session
// submitted or watched it, and otherwise leaves a fresh form for the next contact.
function adopt(fetched: ContactGenerationJob | null) {
  if (!fetched || fetched.id === dismissedID) { job.value = null; return; }
  if (fetched.status !== 'complete') { job.value = fetched; return; }
  if (job.value?.id === fetched.id || submissionID === fetched.id) created.value = fetched.contactID ?? null;
  dismissedID = fetched.id; job.value = null; submissionID = null;
}
export function useContactGeneration() {
  const onboarding = useOnboarding();
  async function refresh() {
    if (busy.value) return;
    if (request) return request;
    const current = revision;
    request = (async () => {
      try {
        await onboarding.refresh();
        const result = await api<{ job: ContactGenerationJob | null }>('contacts/generation');
        if (current !== revision) return;
        if (!initialized) {
          const saved = onboarding.snapshot.value?.input;
          if (saved) Object.assign(draft, { language: saved.language, country: saved.country, style: saved.style, customStyle: saved.customStyle ?? '' });
          initialized = true;
        }
        adopt(result.job);
        if (job.value) { Object.assign(draft, job.value.input); submissionID = job.value.id; }
        error.value = null;
      } catch (failure) { if (current === revision) error.value = errorMessage(failure); }
      finally { if (current === revision) request = null; }
    })();
    return request;
  }
  async function submit() {
    if (busy.value) return;
    const current = ++revision;
    request = null; busy.value = true; error.value = null;
    submissionID ??= crypto.randomUUID();
    try {
      const result = await api<{ job: ContactGenerationJob }>('contacts/generation', { json: { id: submissionID, input: { ...draft, customStyle: draft.style === 'custom' ? draft.customStyle : undefined } } });
      if (current === revision) adopt(result.job);
    } catch (failure) { if (current === revision) error.value = errorMessage(failure); }
    finally { if (current === revision) busy.value = false; }
  }
  return { draft, job: readonly(job), busy: readonly(busy), error: readonly(error), created, options: onboarding.options, refresh, submit };
}
