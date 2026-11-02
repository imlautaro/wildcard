// Fades `.reveal` elements in as they scroll into view. The hidden starting state
// only applies under html.js (set by the head script in app.vue), so content stays
// visible without JavaScript, and site.css skips it under prefers-reduced-motion.
// Revealed elements get a data-in attribute rather than a class: Vue rewrites the
// class attribute of elements with a :class binding (the scenes), dropping it.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-in', '');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
  });
});
