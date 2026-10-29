// Material press ripple, as in apps/web, for this app's interactive classes. One
// delegated listener keeps templates unchanged: add `data-ripple` to opt another
// element in, or `data-no-ripple` to opt one out. The wave lives in its own
// clipping layer so hosts keep overflow visible (badges sit outside icon buttons).
const rippleHosts = [
  '.button', '.icon-button', '.button-row', '.rail-item .indicator', '[data-ripple]',
].join(', ');

// Touch presses wait briefly so a scroll that starts on a row doesn't flash it.
const touchDelay = 90;
const touchSlop = 10;

export default defineNuxtPlugin(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pending: { id: number; host: HTMLElement; x: number; y: number; timer: number } | null = null;

  function rippleHost(target: EventTarget | null) {
    const host = target instanceof Element ? target.closest<HTMLElement>(rippleHosts) : null;
    if (!host || host.closest('[data-no-ripple]')) return null;
    if (host.matches(':disabled') || host.getAttribute('aria-disabled') === 'true') return null;
    return host;
  }

  /** Starts a wave at the press point and returns the function that fades it out. */
  function spawn(host: HTMLElement, x: number, y: number) {
    let layer = host.querySelector<HTMLElement>(':scope > .ripple-layer');
    if (!layer) {
      layer = document.createElement('span');
      layer.className = 'ripple-layer';
      layer.setAttribute('aria-hidden', 'true');
      host.append(layer);
    }
    const rect = host.getBoundingClientRect();
    // The circle must reach the farthest corner from the press point.
    const radius = Math.hypot(Math.max(x - rect.left, rect.right - x), Math.max(y - rect.top, rect.bottom - y));
    const wave = document.createElement('span');
    wave.className = 'ripple';
    wave.style.width = wave.style.height = `${radius * 2}px`;
    wave.style.left = `${x - rect.left - radius}px`;
    wave.style.top = `${y - rect.top - radius}px`;
    layer.append(wave);

    // Fade out on release, but never before the wave has mostly expanded.
    const started = performance.now();
    return () => window.setTimeout(() => {
      wave.classList.add('released');
      window.setTimeout(() => wave.remove(), 300);
    }, Math.max(0, 225 - (performance.now() - started)));
  }

  /** Keeps the wave visible while the pointer is held. */
  function hold(release: () => void) {
    const done = () => {
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
      release();
    };
    window.addEventListener('pointerup', done, { passive: true });
    window.addEventListener('pointercancel', done, { passive: true });
  }

  function cancelPending() {
    if (pending) window.clearTimeout(pending.timer);
    pending = null;
  }

  document.addEventListener('pointerdown', (event) => {
    if (reducedMotion.matches || event.button !== 0) return;
    const host = rippleHost(event.target);
    if (!host) return;
    cancelPending();
    if (event.pointerType !== 'touch') {
      hold(spawn(host, event.clientX, event.clientY));
      return;
    }
    const { pointerId: id, clientX: x, clientY: y } = event;
    pending = { id, host, x, y, timer: window.setTimeout(() => { pending = null; hold(spawn(host, x, y)); }, touchDelay) };
  }, { passive: true });

  document.addEventListener('pointermove', (event) => {
    if (pending?.id === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > touchSlop) cancelPending();
  }, { passive: true });

  // A quick tap ends before the delay: show its ripple now and let it fade.
  document.addEventListener('pointerup', (event) => {
    if (pending?.id !== event.pointerId) return;
    const { host, x, y } = pending;
    cancelPending();
    spawn(host, x, y)();
  }, { passive: true });
  document.addEventListener('pointercancel', cancelPending, { passive: true });
});
