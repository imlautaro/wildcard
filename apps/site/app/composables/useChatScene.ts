// Insert composer beats before outgoing messages while preserving the scene's
// original message/task steps. useScene owns visibility, looping and reduced motion.
export function useChatScene(
  target: Ref<HTMLElement | null>,
  delays: readonly number[],
  messages: readonly { step: number; text: () => string; composer?: string }[],
  options: { hold?: number } = {},
) {
  interface Beat { step: number; message?: number; progress?: number; pressing?: boolean }
  const beats: Beat[] = [{ step: 0 }];
  const timing: number[] = [];
  const append = (delay: number, beat: Beat) => { timing.push(delay); beats.push(beat); };
  delays.forEach((delay, index) => {
    const message = messages.findIndex(item => item.step === index + 1);
    if (message >= 0) {
      append(Math.min(delay, 700), { step: index, message, progress: 0 });
      for (let chunk = 1; chunk <= 32; chunk += 1) {
        append(55, { step: index, message, progress: chunk / 32 });
      }
      append(320, { step: index, message, progress: 1, pressing: true });
      append(220, { step: index + 1 });
    } else {
      append(delay, { step: index + 1 });
    }
  });
  const scene = useScene(target, timing, options);
  const current = computed(() => beats[scene.step.value]!);
  const step = computed(() => current.value.step);
  function composer(id = 'default') {
    const beat = current.value;
    const message = beat.message === undefined ? undefined : messages[beat.message];
    if (!message || (message.composer ?? 'default') !== id) return { draft: '', composing: false, pressing: false };
    const characters = Array.from(message.text());
    return {
      draft: characters.slice(0, Math.ceil(characters.length * (beat.progress ?? 0))).join(''),
      composing: true,
      pressing: !!beat.pressing,
    };
  }
  return { step, fading: scene.fading, composer };
}
