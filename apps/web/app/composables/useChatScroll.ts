// Position each visit after Vue patches the DOM, before the browser paints it.
export function useChatScroll(
  scroller: Ref<HTMLElement | undefined>,
  content: Ref<HTMLElement | undefined>,
  key: MaybeRefOrGetter<string>,
  loaded: MaybeRefOrGetter<boolean>,
) {
  const positioned = ref(false);
  const pinned = ref(true);
  let resizeObserver: ResizeObserver | undefined;
  function onScroll() {
    const element = scroller.value;
    if (element) pinned.value = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }
  function alignBottom() {
    if (scroller.value) scroller.value.scrollTo({ top: scroller.value.scrollHeight, behavior: 'instant' });
  }
  function scrollToBottom() {
    pinned.value = true;
    const visit = toValue(key);
    void nextTick(() => { if (visit === toValue(key)) alignBottom(); });
  }
  watch(content, (element) => {
    resizeObserver?.disconnect();
    if (!element) return;
    resizeObserver = new ResizeObserver(() => {
      if (positioned.value && pinned.value) alignBottom();
    });
    resizeObserver.observe(element);
    if (scroller.value) resizeObserver.observe(scroller.value);
  }, { flush: 'post' });
  onBeforeUnmount(() => resizeObserver?.disconnect());
  watch(() => toValue(key), () => { positioned.value = false; pinned.value = true; }, { flush: 'sync' });
  watch([scroller, () => toValue(key), () => toValue(loaded)], () => {
    if (!scroller.value || !toValue(loaded) || positioned.value) return;
    alignBottom();
    positioned.value = true;
  }, { flush: 'post' });
  return { positioned, pinned, onScroll, scrollToBottom };
}
