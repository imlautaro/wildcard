// Chat side panel for the task board (docs/tasks.md#opening-tasks). When the chat pane
// (the element bound to `split`) is at least 820px wide and the chat has an active
// list, the board sits beside the messages and the Tasks button shows or hides it.
// The hidden choice is one flag per browser, shared by every chat.
const storageKey = 'wildcard-task-panel-hidden';

export function useTaskPanel(hasTasks: MaybeRefOrGetter<boolean>) {
  const split = ref<HTMLElement>();
  const width = ref(0);
  const hidden = ref(false);
  const fits = computed(() => width.value >= 820);
  const open = computed(() => toValue(hasTasks) && fits.value && !hidden.value);
  function toggle() {
    hidden.value = !hidden.value;
    try { localStorage.setItem(storageKey, hidden.value ? '1' : '0'); } catch { /* storage unavailable: keep it for this visit */ }
  }
  let observer: ResizeObserver | undefined;
  onMounted(() => {
    try { hidden.value = localStorage.getItem(storageKey) === '1'; } catch { /* storage unavailable */ }
    observer = new ResizeObserver(([entry]) => { width.value = entry?.contentRect.width ?? 0; });
    if (split.value) observer.observe(split.value);
  });
  watch(split, (element, previous) => {
    if (previous) observer?.unobserve(previous);
    if (element) observer?.observe(element);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return { split, fits, hidden, open, toggle };
}
