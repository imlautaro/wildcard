// Port of apps/ios/Wildcard/Chat/ReadAcknowledgementQueue.swift. Session-owned, so
// leaving a chat never abandons an observed read. The highest observed watermark
// wins, including observations made while a write is in flight. Failures keep the
// intent and retry from the next foreground tick.
type Pending = { sequence: number; acknowledge: (sequence: number) => Promise<number> };
const pending = new Map<string, Pending>();
const requests = new Map<string, symbol>();

registerSessionReset(() => {
  pending.clear();
  requests.clear();
});

function start(key: string) {
  if (requests.has(key) || !pending.has(key)) return;
  const identity = Symbol(key);
  requests.set(key, identity);
  void (async () => {
    try {
      for (let submitted = pending.get(key); submitted; submitted = pending.get(key)) {
        const confirmed = await submitted.acknowledge(submitted.sequence);
        const latest = pending.get(key);
        if (requests.get(key) !== identity || !latest) return;
        if (confirmed >= latest.sequence) {
          pending.delete(key);
          return;
        }
        // A newer observation arrived during the write: send it next. A partial
        // acknowledgement waits for the next tick.
        if (confirmed < submitted.sequence) return;
      }
    } catch {
      // Keep the intent across navigation and transient failures.
    } finally {
      if (requests.get(key) === identity) requests.delete(key);
    }
  })();
}

export function enqueueRead(key: string, sequence: number, confirmed: number, acknowledge: Pending['acknowledge']) {
  if (sequence <= confirmed) return;
  const existing = pending.get(key);
  if (existing) existing.sequence = Math.max(existing.sequence, sequence);
  else pending.set(key, { sequence, acknowledge });
  start(key);
}

export function retryPendingReads() {
  for (const key of pending.keys()) start(key);
}

export function forgetRead(key: string) {
  pending.delete(key);
  requests.delete(key);
}
