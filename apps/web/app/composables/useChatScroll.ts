// Position each visit after Vue patches the DOM, before the browser paints it.
export function useChatScroll(
  scroller: Ref<HTMLElement | undefined>,
  key: MaybeRefOrGetter<string>,
  loaded: MaybeRefOrGetter<boolean>,
) {
  const positioned = ref(false);
  watch(() => toValue(key), () => { positioned.value = false; }, { flush: 'sync' });
  watch([scroller, () => toValue(key), () => toValue(loaded)], () => {
    if (!scroller.value || !toValue(loaded) || positioned.value) return;
    scroller.value.scrollTo({ top: scroller.value.scrollHeight, behavior: 'instant' });
    positioned.value = true;
  }, { flush: 'post' });
  return { positioned };
}
