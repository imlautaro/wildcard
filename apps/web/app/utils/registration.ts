// Whether new accounts can be created (docs/authentication.md#early-access-waitlist).
// Session-owned: read once per page load in the background while the sign-in form
// is already usable; `null` until known, and a failed read keeps it `null` so the
// normal form stays and a 403 REGISTRATION_CLOSED switches to the waitlist instead.
export const registrationOpen = ref<boolean | null>(null);
// The email that joined the waitlist in this page session, so returning to the
// screen shows the confirmation instead of an empty form.
export const waitlistJoinedEmail = ref<string | null>(null);
let pending: Promise<void> | null = null;

export function loadRegistrationStatus() {
  if (registrationOpen.value !== null) return Promise.resolve();
  pending ??= api<{ registrationOpen: boolean }>('waitlist')
    .then((result) => { registrationOpen.value = result.registrationOpen === true; })
    .catch(() => {})
    .finally(() => { pending = null; });
  return pending;
}
