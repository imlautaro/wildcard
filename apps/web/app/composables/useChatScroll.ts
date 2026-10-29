// Position each visit after Vue patches the DOM, before the browser paints it.
export function useChatScroll(
  scroller: Ref<HTMLElement | undefined>,
  content: Ref<HTMLElement | undefined>,
  key: MaybeRefOrGetter<string>,
  loaded: MaybeRefOrGetter<boolean>,
  changes: MaybeRefOrGetter<unknown>,
) {
  const positioned = ref(false);
  const pinned = ref(true);
  let resizeObserver: ResizeObserver | undefined;
  function onScroll() {
    const element = scroller.value;
    if (element) pinned.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 2;
  }
  let touchY: number | undefined;
  function onWheel(event: WheelEvent) { if (event.deltaY < 0) pinned.value = false; }
  function onTouchStart(event: TouchEvent) { touchY = event.touches[0]?.clientY; }
  function onTouchMove(event: TouchEvent) {
    const y = event.touches[0]?.clientY;
    if (y !== undefined && touchY !== undefined && y > touchY) pinned.value = false;
    touchY = y;
  }
  function onKeydown(event: KeyboardEvent) {
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) pinned.value = false;
  }
  // Capture a visible row before Vue prepends history or updates existing rows.
  // Manual anchoring avoids counting unrelated new messages in a height delta.
  let anchor: { element: HTMLElement; offset: number } | undefined;
  watch(() => toValue(changes), () => {
    anchor = undefined;
    if (pinned.value || !scroller.value) return;
    const top = scroller.value.getBoundingClientRect().top;
    const element = Array.from(content.value?.querySelectorAll<HTMLElement>('[id^="message-"]') ?? [])
      .find((row) => row.getBoundingClientRect().bottom > top);
    if (element) anchor = { element, offset: element.getBoundingClientRect().top - top };
  });
  watch(() => toValue(changes), () => {
    if (pinned.value) alignBottom();
    else if (anchor?.element.isConnected && scroller.value) {
      scroller.value.scrollTop += anchor.element.getBoundingClientRect().top - scroller.value.getBoundingClientRect().top - anchor.offset;
    }
    anchor = undefined;
  }, { flush: 'post' });
  function alignBottom() {
    if (scroller.value) scroller.value.scrollTo({ top: scroller.value.scrollHeight, behavior: 'instant' });
  }
  function scrollToBottom() {
    pinned.value = true;
    const visit = toValue(key);
    void nextTick(() => { if (visit === toValue(key) && pinned.value) alignBottom(); });
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
  return { positioned, pinned, onScroll, onWheel, onTouchStart, onTouchMove, onKeydown, scrollToBottom };
}
