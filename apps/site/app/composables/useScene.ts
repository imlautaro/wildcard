// Drives an animated scene as a sequence of beats. `delays[i]` is the wait before
// beat i + 1; `step` counts the beats shown (0 … delays.length). Scenes render
// with `v-if="step >= n"`.
//
// - The server (and a browser without JavaScript) renders the final state, so the
//   prerendered HTML carries the whole story.
// - A scene that starts off screen resets to beat 0 on mount and plays when at
//   least part of it is visible; one already on screen keeps its final state
//   and replays after the hold.
// - It pauses while off screen and loops while visible: after the last beat it
//   holds, fades (`fading`) and restarts.
// - With prefers-reduced-motion it stays on the final state.
export function useScene(target: Ref<HTMLElement | null>, delays: readonly number[], options: { hold?: number } = {}) {
  const total = delays.length;
  const hold = options.hold ?? 4200;
  const step = ref(total);
  const fading = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  let observer: IntersectionObserver | undefined;

  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  function schedule() {
    clear();
    if (!visible) return;
    if (step.value < total) {
      timer = setTimeout(() => { step.value += 1; schedule(); }, delays[step.value]);
    } else {
      timer = setTimeout(() => {
        fading.value = true;
        timer = setTimeout(() => { step.value = 0; fading.value = false; schedule(); }, 420);
      }, hold);
    }
  }

  onMounted(() => {
    const element = target.value;
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const rect = element.getBoundingClientRect();
    if (rect.top > innerHeight || rect.bottom < 0) step.value = 0;
    observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) schedule();
      else {
        clear();
        // A canceled fade must not leave the scene transparent on re-entry.
        if (fading.value) { step.value = 0; fading.value = false; }
      }
    }, { threshold: 0 });
    observer.observe(element);
  });
  onBeforeUnmount(() => { clear(); observer?.disconnect(); });

  return { step, fading };
}
