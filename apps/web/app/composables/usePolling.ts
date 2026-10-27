// Runs `tick` while the page is visible, at an interval chosen after each run.
// Returning to the tab refreshes immediately, like the iOS foreground refresh.
export function usePolling(tick: () => Promise<unknown>, interval: () => number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  async function run() {
    clearTimeout(timer);
    if (!active || document.visibilityState !== 'visible') return;
    try { await tick(); }
    finally {
      if (active) timer = setTimeout(run, interval());
    }
  }
  function onVisibility() {
    if (document.visibilityState === 'visible') void run();
    else clearTimeout(timer);
  }

  onMounted(() => {
    active = true;
    document.addEventListener('visibilitychange', onVisibility);
    timer = setTimeout(run, interval());
  });
  onBeforeUnmount(() => {
    active = false;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  });
  return { now: run };
}
