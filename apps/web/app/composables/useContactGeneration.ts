import { parseContactName, type ContactGenerationInput, type ContactGenerationJob, type ContactPhotoSource } from '../../../../shared/contact-generation';
type Draft = Omit<ContactGenerationInput, 'name' | 'photo'> & { name: string; photo: ContactPhotoSource };
const initial = (): Draft => ({ age: 25, gender: 'female', style: 'cartoon', customStyle: '', purpose: 'friends', language: 'en', country: '', name: '', photo: 'generate' });
const draft = reactive(initial());
// The cropped JPEG for "Upload a photo"; kept with the draft until the job is submitted.
const upload = shallowRef<Blob | null>(null);
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
  Object.assign(draft, initial()); upload.value = null; job.value = null; busy.value = false; error.value = null; created.value = null;
});
// A finished job is never a form state: it opens the new contact when this session
// submitted or watched it, and otherwise leaves a fresh form for the next contact.
function adopt(fetched: ContactGenerationJob | null) {
  if (!fetched || fetched.id === dismissedID) { job.value = null; return; }
  if (fetched.status !== 'complete') { job.value = fetched; return; }
  if (job.value?.id === fetched.id || submissionID === fetched.id) {
    created.value = fetched.contactID ?? null;
    // The next contact starts without this one's name or photo.
    draft.name = ''; upload.value = null;
    if (draft.photo === 'upload') draft.photo = 'generate';
  }
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
        if (job.value) {
          const { name, photo, ...input } = job.value.input;
          Object.assign(draft, input, { name: name ?? '', photo: photo ?? 'generate' });
          submissionID = job.value.id;
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
      const { name, ...fields } = draft;
      const chosen = parseContactName(name);
      const input = { ...fields, customStyle: draft.style === 'custom' ? draft.customStyle : undefined, ...(chosen ? { name: chosen } : {}) };
      const photo = draft.photo === 'upload' && upload.value ? await blobBase64(upload.value) : undefined;
      // A submitted job already has its photo on the server, so a retry may omit it.
      if (draft.photo === 'upload' && !photo && !job.value) throw new Error(translate('contacts.new.photoNeeded'));
      const result = await api<{ job: ContactGenerationJob }>('contacts/generation', { json: { id: submissionID, input, ...(photo ? { upload: photo } : {}) } });
      if (current === revision) adopt(result.job);
    } catch (failure) { if (current === revision) error.value = errorMessage(failure); }
    finally { if (current === revision) busy.value = false; }
  }
  return { draft, upload, job: readonly(job), busy: readonly(busy), error: readonly(error), created, options: onboarding.options, refresh, submit };
}

async function blobBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
