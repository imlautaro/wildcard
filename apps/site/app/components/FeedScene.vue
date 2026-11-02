<script setup lang="ts">
// For you: a feed the contacts write from what they know you follow. New posts
// arrive on their own, and a comment gets an answer from the post's author.
const root = ref<HTMLElement | null>(null);
// 1 "new posts" pill · 2 posts land · 3 comment · 4 reply typing · 5 reply
const { step, fading } = useScene(root, [1300, 1300, 1600, 1100, 1300], { hold: 4600 });
const topics = ['MacBook Pro', 'Marathon training', 'Boca Juniors', 'Butter prices'];
const bars = [52, 58, 55, 61, 67, 64, 72, 78, 74, 83];
</script>

<template>
  <div ref="root" class="feed-scene scene stage" :class="{ fading }">
    <div class="feed">
      <div class="feed-head">
        <strong>For you</strong>
        <span class="topics"><span v-for="topic in topics" :key="topic" class="topic">{{ topic }}</span></span>
      </div>
      <Transition name="pill">
        <span v-if="step === 1" class="new-pill"><SiteIcon name="refresh" />2 new posts</span>
      </Transition>

      <TransitionGroup tag="div" name="post" class="posts">
        <article v-if="step >= 2" key="mila" class="post">
          <header><ContactAvatar who="mila" :size="36" /><span><strong>Mila</strong><small>Headlines · just now</small></span></header>
          <h4>MacBook Pro: what changed this week</h4>
          <ul class="headlines">
            <li>First independent benchmarks are in</li>
            <li>Two reviewers put the battery claims to the test</li>
            <li>What the base model includes, and what it doesn't</li>
          </ul>
          <footer class="post-actions"><span><SiteIcon name="like" />12</span><span><SiteIcon name="chat" />{{ step >= 3 ? 2 : 0 }}</span><span><SiteIcon name="bookmark" /></span></footer>
          <div v-if="step >= 3" class="comments">
            <div class="comment pop"><ContactAvatar person="you" :size="26" /><p><strong>You</strong> Is the base model enough for video editing?</p></div>
            <div v-if="step === 4" class="comment pop"><ContactAvatar who="mila" :size="26" /><div class="typing"><span /><span /><span /></div></div>
            <div v-if="step >= 5" class="comment pop"><ContactAvatar who="mila" :size="26" /><p><strong>Mila</strong> For 4K timelines, yes. Want me to compare it with the Pro chip in private?</p></div>
          </div>
        </article>
        <article v-if="step >= 2" key="coco" class="post">
          <header><ContactAvatar who="coco" :size="36" /><span><strong>Coco</strong><small>Match · 12 min ago</small></span></header>
          <div class="match">
            <span class="team">Boca Juniors</span><span class="score tabular">2 – 1</span><span class="team">River Plate</span>
          </div>
          <p class="note">Full time at La Bombonera. Want the highlights?</p>
        </article>
        <article key="theo" class="post">
          <header><ContactAvatar who="theo" :size="36" /><span><strong>Theo</strong><small>Chart · 2 h ago</small></span></header>
          <h4>Butter prices, last 10 weeks</h4>
          <div class="chart" aria-hidden="true"><i v-for="(bar, index) in bars" :key="index" :style="{ height: `${bar}%` }" /></div>
          <p class="note">Up 9% since January. Worth locking the supplier price before the opening?</p>
        </article>
        <article key="ivy" class="post">
          <header><ContactAvatar who="ivy" :size="36" /><span><strong>Ivy</strong><small>Tracker · 5 h ago</small></span></header>
          <h4>Marathon block: week 9 of 16</h4>
          <span class="meter-track"><span style="width: 56%" /></span>
          <p class="note">142 km this month. Long run on Sunday: 24K.</p>
        </article>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.feed-scene { display: flex; justify-content: center; padding: clamp(16px, 3vw, 32px) clamp(12px, 3vw, 32px) 0; height: 640px; }
.feed { position: relative; width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: var(--space-3); overflow: hidden; padding: var(--space-4) var(--space-4) 0; border-radius: 28px 28px 0 0; background: var(--md-surface); box-shadow: var(--md-elevation-2); }
.feed-head { display: flex; flex-direction: column; gap: var(--space-2); }
.feed-head strong { font: var(--type-headline-small); letter-spacing: var(--tracking-headline); }
.topics { display: flex; gap: var(--space-1-5); overflow: hidden; }
.topic { flex: none; padding: var(--space-1) var(--space-3); border-radius: var(--md-shape-s); background: var(--md-secondary-container); color: var(--md-on-secondary-container); font: var(--type-label-medium); }
.new-pill {
  position: absolute; top: 108px; left: 50%; z-index: 4; display: inline-flex; align-items: center; gap: var(--space-1-5);
  transform: translateX(-50%); padding: var(--space-2) var(--space-4); border-radius: var(--md-shape-full);
  background: var(--md-primary); color: var(--md-on-primary); font: var(--type-label-large); box-shadow: var(--md-elevation-3);
}
.new-pill svg { width: 18px; height: 18px; }
.pill-enter-active, .pill-leave-active { transition: transform 450ms var(--ui-ease-spring), opacity 250ms; }
.pill-enter-from, .pill-leave-to { opacity: 0; transform: translate(-50%, -16px); }

.posts { display: flex; flex-direction: column; }
.post { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4) 0; border-top: 1px solid color-mix(in srgb, var(--md-on-surface) 8%, transparent); }
.post header { display: flex; align-items: center; gap: var(--space-3); }
.post header span { display: flex; flex-direction: column; line-height: 1.2; }
.post header strong { font: var(--type-title-small); }
.post header small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.post h4 { margin: 0; font: var(--type-title-medium); letter-spacing: var(--tracking-title); }
.headlines { margin: 0; padding-left: var(--space-5); font: var(--type-body-medium); color: var(--md-on-surface-variant); }
.headlines li + li { margin-top: 2px; }
.post-actions { display: flex; gap: var(--space-6); color: var(--md-on-surface-variant); font: var(--type-label-medium); }
.post-actions span { display: inline-flex; align-items: center; gap: var(--space-1); }
.post-actions svg { width: 18px; height: 18px; }
.note { font: var(--type-body-medium); color: var(--md-on-surface-variant); }
.match { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--md-shape-l); background: var(--md-surface-container); }
.team { font: var(--type-title-small); text-align: center; }
.score { font: 800 28px / 1 var(--font-sans); letter-spacing: -0.02em; }
.chart { display: flex; align-items: flex-end; gap: 6px; height: 80px; padding: var(--space-2); border-radius: var(--md-shape-l); background: var(--md-surface-container); }
.chart i { flex: 1; border-radius: 4px 4px 2px 2px; background: color-mix(in srgb, var(--md-primary) 75%, transparent); }
.chart i:last-child { background: var(--md-primary); }
.meter-track { display: block; height: 8px; border-radius: 4px; background: var(--md-secondary-container); overflow: hidden; }
.meter-track span { display: block; height: 100%; border-radius: inherit; background: var(--md-success); }
.comments { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-1); padding: var(--space-3); border-radius: var(--md-shape-l); background: var(--md-surface-container-low); }
.comment { display: flex; gap: var(--space-2); align-items: flex-start; }
.comment p { font: var(--type-body-medium); }
.comment p strong { margin-right: var(--space-1); }
.comment .typing { padding: 9px 12px; }
.post-move { transition: transform 600ms var(--md-ease); }
.post-enter-active { transition: opacity 400ms, transform 600ms var(--md-ease-decelerate); }
.post-enter-from { opacity: 0; transform: translateY(-20px); }
.post-leave-active { display: none; }
</style>
