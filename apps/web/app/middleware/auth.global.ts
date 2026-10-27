// Restores the cookie-backed session once, then keeps signed-out visitors on the
// sign-in page and signed-in users off it.
export default defineNuxtRouteMiddleware(async (to) => {
  const { status, restore } = useSession();
  await restore();
  if (status.value === 'unreachable') return;
  const signedIn = status.value === 'signed-in';
  if (!signedIn && to.path !== '/sign-in') return navigateTo('/sign-in');
  if (signedIn && to.path === '/sign-in') return navigateTo('/');
});
