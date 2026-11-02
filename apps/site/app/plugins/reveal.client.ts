// Animate each new page's sections once as they enter the viewport. Content is
// visible by default: observer or navigation failures must never hide the page.
// Use an attribute because Vue owns the class binding on animated scenes.
export default defineNuxtPlugin((nuxtApp) => {
  let observer: IntersectionObserver | undefined;
  async function observePage() {
    await nextTick();
    observer?.disconnect();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-in', '');
        observer?.unobserve(entry.target);
      }
    }, { threshold: 0 });
    document.querySelectorAll('.reveal:not([data-in])').forEach(element => observer?.observe(element));
  }
  nuxtApp.hook('app:mounted', observePage);
  nuxtApp.hook('page:finish', observePage);
  if (import.meta.hot) import.meta.hot.dispose(() => observer?.disconnect());
});
