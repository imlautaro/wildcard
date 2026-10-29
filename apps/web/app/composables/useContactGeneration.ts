import type { ContactGenerationInput, ContactGenerationJob } from '../../../../shared/contact-generation';
const initial = (): ContactGenerationInput => ({ age: 25, gender: 'female', style: 'cartoon', purpose: 'friends', language: 'en', country: '' });
const draft = reactive(initial());
const job = ref<ContactGenerationJob | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
let initialized = false, revision = 0;
let request: Promise<void> | null = null;
let submissionID: string | null = null;
let dismissedID: string | null = null;
registerSessionReset(() => {
  revision++; request = null; initialized = false; submissionID = null; dismissedID = null;
  Object.assign(draft, initial()); job.value = null; busy.value = false; error.value = null;
});
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
          if (saved) Object.assign(draft, { language: saved.language, country: saved.country, style: saved.style });
          initialized = true;
        }
        job.value = result.job?.id === dismissedID ? null : result.job;
        if (result.job && result.job.status !== 'complete') { Object.assign(draft, result.job.input); submissionID = result.job.id; }
        if (job.value?.status === 'complete' && job.value.contactID) {
          const { contact } = await api<{ contact: import('~/utils/types').Contact }>(`contacts/${job.value.contactID}`);
          if (current !== revision) return;
          useChats().upsertContact(contact);
        }
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
      const result = await api<{ job: ContactGenerationJob }>('contacts/generation', { json: { id: submissionID, input: { ...draft } } });
      if (current === revision) job.value = result.job?.id === dismissedID ? null : result.job;
    } catch (failure) { if (current === revision) error.value = errorMessage(failure); }
    finally { if (current === revision) busy.value = false; }
  }
  function another() { revision++; request = null; dismissedID = job.value?.id ?? null; submissionID = null; job.value = null; }
  return { draft, job: readonly(job), busy: readonly(busy), error: readonly(error), options: onboarding.options, refresh, submit, another };
}
