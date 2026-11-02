<script setup lang="ts">
// Smaller features as a bento grid, each tile with a CSS-only loop.
const wave = [6, 14, 22, 12, 26, 18, 8, 20, 28, 16, 10, 24, 14, 6, 18, 22, 12, 8];
const { t } = useI18n();
</script>

<template>
  <div class="bento">
    <article class="tile reveal">
      <div class="art art-schedule" aria-hidden="true">
        <span class="sched"><AppIcon name="clock" /><span><strong>{{ t('more.scheduleToday') }}</strong><small>{{ t('more.scheduleTodayText') }}</small></span></span>
        <span class="sched second"><AppIcon name="refresh" /><span><strong>{{ t('more.scheduleWeekly') }}</strong><small>{{ t('more.scheduleWeeklyText') }}</small></span></span>
      </div>
      <h3>{{ t('more.schedule') }}</h3>
      <p>{{ t('more.scheduleText') }}</p>
    </article>
    <article class="tile reveal delay-1">
      <div class="art art-voice" aria-hidden="true">
        <span class="play"><AppIcon name="play" filled /></span>
        <span class="wave"><i v-for="(h, i) in wave" :key="i" :style="{ height: `${h}px`, animationDelay: `${i * 70}ms` }" /></span>
        <small class="tabular">0:14</small>
      </div>
      <h3>{{ t('more.voice') }}</h3>
      <p>{{ t('more.voiceText') }}</p>
    </article>
    <article class="tile reveal delay-2">
      <div class="art art-sticker" aria-hidden="true">
        <img class="sticker" src="/features/coco-sticker.png" alt="" width="104" height="104" loading="lazy" decoding="async">
        <img class="sticker two" src="/features/pixel-sticker.png" alt="" width="88" height="88" loading="lazy" decoding="async">
      </div>
      <h3>{{ t('more.stickers') }}</h3>
      <p>{{ t('more.stickersText') }}</p>
    </article>
    <article class="tile reveal">
      <div class="art art-photos" aria-hidden="true">
        <span class="photo p1"><img src="/features/ivy-selfie.jpg" alt="" width="480" height="640" loading="lazy" decoding="async"></span>
        <span class="photo p2"><img src="/features/mila-selfie.jpg" alt="" width="480" height="640" loading="lazy" decoding="async"></span>
        <span class="photo p3"><img src="/features/bakery.jpg" alt="" width="480" height="640" loading="lazy" decoding="async"></span>
      </div>
      <h3>{{ t('more.photos') }}</h3>
      <p>{{ t('more.photosText') }}</p>
    </article>
    <article class="tile reveal delay-1">
      <div class="art art-mini" aria-hidden="true">
        <span class="mini-row"><span>{{ t('more.miniWater') }}</span><span class="mini-bar"><i style="--w: 75%" /></span><small>6/8</small></span>
        <span class="mini-row"><span>{{ t('more.miniReading') }}</span><span class="mini-bar"><i style="--w: 40%" /></span><small>12/30</small></span>
        <span class="mini-row"><span>{{ t('more.miniSteps') }}</span><span class="mini-bar"><i style="--w: 90%" /></span><small>9k</small></span>
      </div>
      <h3>{{ t('more.miniApps') }}</h3>
      <p>{{ t('more.miniAppsText') }}</p>
    </article>
    <article class="tile reveal delay-2">
      <div class="art art-doc" aria-hidden="true">
        <span class="doc-line w90" /><span class="doc-line w70" /><span class="doc-line w80"><b>[1]</b></span><span class="doc-line w60"><b>[2]</b></span>
      </div>
      <h3>{{ t('more.research') }}</h3>
      <p>{{ t('more.researchText') }}</p>
    </article>
    <article class="tile reveal">
      <div class="art art-monitor" aria-hidden="true">
        <span class="radar"><SiteIcon name="radar" /></span>
        <span class="monitor-text"><strong>{{ t('more.monitorChanged') }}</strong><small>{{ t('more.monitorChecked') }}</small></span>
      </div>
      <h3>{{ t('more.monitors') }}</h3>
      <p>{{ t('more.monitorsText') }}</p>
    </article>
    <article class="tile reveal delay-1">
      <div class="art art-react" aria-hidden="true">
        <span class="mini-bubble">{{ t('more.reactionBubble') }}</span>
        <span class="reactions"><span>😂</span><span>❤️</span></span>
      </div>
      <h3>{{ t('more.reactions') }}</h3>
      <p>{{ t('more.reactionsText') }}</p>
    </article>
  </div>
</template>

<style scoped>
.bento { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.tile { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4) var(--space-4) var(--space-5); border-radius: var(--md-shape-xl); background: var(--md-surface-container-low); }
.tile h3 { margin-top: var(--space-2); font: var(--type-title-medium); font-size: 17px; letter-spacing: var(--tracking-title); }
.tile p { font: var(--type-body-medium); font-size: 14.5px; line-height: 21px; color: var(--md-on-surface-variant); }
.art { position: relative; display: flex; align-items: center; justify-content: center; height: 132px; overflow: hidden; border-radius: var(--md-shape-l); background: var(--md-surface-container); }

.art-schedule { flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
.sched { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-2) var(--space-3); border-radius: var(--md-shape-m); background: var(--md-surface); animation: float 4s var(--md-ease) infinite; }
.sched.second { animation-delay: -2s; }
.sched svg { width: 20px; height: 20px; color: var(--md-primary); }
.sched span { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.sched strong { font: var(--type-label-large); }
.sched small { font: var(--type-body-small); color: var(--md-on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes float { 50% { transform: translateY(-3px); } }

.art-voice { gap: var(--space-3); padding: 0 var(--space-4); }
.play { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border-radius: 50%; background: var(--md-primary); color: var(--md-on-primary); }
.play svg { width: 20px; height: 20px; }
.wave { display: flex; align-items: center; gap: 3px; flex: 1; height: 32px; }
.wave i { flex: 1; border-radius: 2px; background: var(--md-primary); transform-origin: center; animation: bars 1.2s var(--md-ease) infinite alternate; }
@keyframes bars { from { transform: scaleY(0.35); } to { transform: scaleY(1); } }
.art-voice small { font: var(--type-label-medium); color: var(--md-on-surface-variant); }

.art-sticker { gap: var(--space-2); }
.sticker { display: block; width: 104px; height: 104px; object-fit: contain; filter: drop-shadow(0 3px 3px rgb(0 0 0 / 15%)); animation: wobble 2.6s var(--ui-ease-spring) infinite; }
.sticker.two { width: 88px; height: 88px; transform: rotate(10deg); animation-delay: -1.3s; }
@keyframes wobble { 0%, 100% { transform: rotate(-6deg) scale(1); } 50% { transform: rotate(6deg) scale(1.05); } }

.art-photos { gap: 4px; padding: var(--space-3); }
.photo { height: 100%; flex: 1; border-radius: var(--md-shape-m); overflow: hidden; display: grid; place-items: center; }
.p1 { flex: 1.2; }
.photo img { width: 100%; height: 100%; object-fit: cover; }
.photo { animation: settle 5s var(--md-ease) infinite; }
.p2 { animation-delay: -1.6s; } .p3 { animation-delay: -3.2s; }
@keyframes settle { 0%, 100% { filter: saturate(1); } 50% { filter: saturate(1.25) brightness(1.04); } }

.art-mini { flex-direction: column; align-items: stretch; gap: var(--space-2); padding: var(--space-4); }
.mini-row { display: grid; grid-template-columns: 64px 1fr 40px; align-items: center; gap: var(--space-2); font: var(--type-label-medium); }
.mini-row small { text-align: right; color: var(--md-on-surface-variant); }
.mini-bar { height: 8px; border-radius: 4px; background: var(--md-surface); overflow: hidden; }
.mini-bar i { display: block; height: 100%; width: var(--w); border-radius: inherit; background: var(--md-primary); animation: grow 3s var(--md-ease) infinite alternate; }
@keyframes grow { from { width: calc(var(--w) * 0.6); } }

.art-doc { flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-4) var(--space-5); }
.doc-line { position: relative; height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--md-on-surface) 14%, transparent); }
.doc-line b { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); font: var(--type-label-small); color: var(--md-primary); }
.w90 { width: 90%; height: 14px; background: color-mix(in srgb, var(--md-on-surface) 28%, transparent); } .w70 { width: 70%; } .w80 { width: 72%; } .w60 { width: 60%; }
.doc-line { animation: shimmer 2.4s linear infinite; }
@keyframes shimmer { 50% { opacity: 0.6; } }

.art-monitor { gap: var(--space-3); padding: 0 var(--space-4); }
.radar { position: relative; display: grid; place-items: center; width: 52px; height: 52px; flex: none; border-radius: 50%; background: var(--md-primary-container); color: var(--md-on-primary-container); }
.radar::after { content: ''; position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 0 color-mix(in srgb, var(--md-primary) 45%, transparent); animation: ping 2s var(--md-ease) infinite; }
@keyframes ping { to { box-shadow: 0 0 0 18px transparent; } }
.radar svg { width: 26px; height: 26px; }
.monitor-text { display: flex; flex-direction: column; line-height: 1.3; }
.monitor-text strong { font: var(--type-label-large); }
.monitor-text small { font: var(--type-body-small); color: var(--md-on-surface-variant); }

.art-react { flex-direction: column; gap: 0; }
.mini-bubble { padding: 9px 14px; border-radius: 20px 20px 20px 4px; background: var(--md-surface); font: var(--type-body-medium); }
.reactions { display: flex; gap: 2px; margin-top: -6px; margin-left: 60px; padding: 2px 6px; border-radius: var(--md-shape-full); background: var(--md-surface-container-highest); box-shadow: var(--md-elevation-1); }
.reactions span { animation: bounce 2.4s var(--ui-ease-spring) infinite; }
.reactions span + span { animation-delay: 0.2s; }
@keyframes bounce { 0%, 70%, 100% { transform: none; } 80% { transform: translateY(-4px) scale(1.15); } }
</style>
