// Restores the cookie-backed session once. Only super admins get past the
// sign-in page; a signed-in non-admin stays there to see why.
export default defineNuxtRouteMiddleware(async (to) => {
  const { status, restore } = useSession();
  await restore();
  if (status.value === 'unreachable') return;
  const admitted = status.value === 'signed-in';
  if (!admitted && to.path !== '/sign-in') return navigateTo('/sign-in');
  if (admitted && to.path === '/sign-in') return navigateTo('/');
});
