<script setup lang="ts">
// "Catch me up": a new contact asks a linked contact for context, then answers
// with what it learned.
const root = ref<HTMLElement | null>(null);
// 1 ask · 2 typing · 3 handoff · 4 handoff done · 5 typing · 6 answer · 7 reply
const { step, fading } = useScene(root, [700, 1300, 1100, 2200, 900, 1600, 1500], { hold: 4200 });
</script>

<template>
  <div ref="root" class="catch-up scene" :class="{ fading }">
    <PhoneFrame title="Nova" who="nova" status="online" class="catch-phone">
      <div class="thread">
        <div class="system-banner">Nova joined your contacts today</div>
        <div v-if="step >= 1" class="bubble-row outgoing pop">
          <div class="bubble">Can you ask Theo to catch you up on the bakery launch?</div>
        </div>
        <div v-if="step === 2 || step === 5" class="bubble-row incoming pop"><div class="typing"><span /><span /><span /></div></div>
        <div v-if="step >= 3" class="handoff pop" :class="{ done: step >= 4 }">
          <ContactAvatar who="nova" :size="28" />
          <span class="wire"><i /><i /><i /></span>
          <ContactAvatar who="theo" :size="28" />
          <span class="handoff-text">{{ step >= 4 ? 'Theo caught Nova up' : 'Nova is asking Theo…' }}</span>
        </div>
        <div v-if="step >= 6" class="bubble-row incoming pop">
          <div class="bubble">
            All caught up! Theo says the soft opening is on the <strong>14th</strong>, the logo is final, and you're still
            choosing an <strong>oat-milk supplier</strong>. Want me to compare the quotes?
          </div>
        </div>
        <div v-if="step >= 7" class="bubble-row outgoing pop">
          <div class="bubble">Yes please 🙏</div>
        </div>
      </div>
    </PhoneFrame>
  </div>
</template>

<style scoped>
.catch-up { display: flex; justify-content: center; }
.catch-phone { width: 100%; }
.handoff {
  align-self: center; display: inline-flex; align-items: center; gap: var(--space-2); margin: var(--space-2) 0; padding: var(--space-2) var(--space-3);
  border-radius: var(--md-shape-full); background: var(--md-surface-container-high); font: var(--type-label-medium);
  color: var(--md-on-surface-variant);
}
.handoff.done { background: var(--md-success-container); color: var(--md-on-success-container); }
.handoff-text { padding-right: var(--space-1); }
.wire { display: inline-flex; gap: 3px; }
.wire i { width: 5px; height: 5px; border-radius: 50%; background: var(--md-primary); animation: wire 1s infinite linear; }
.wire i:nth-child(2) { animation-delay: 0.2s; } .wire i:nth-child(3) { animation-delay: 0.4s; }
.done .wire i { animation: none; background: currentColor; }
@keyframes wire { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
</style>
