<script setup lang="ts">
// The landing page. Copy follows what the app actually does (docs/*.md); see
// docs/site.md before changing a claim. Messages: i18n/locales/<locale>.json.
const { t } = useI18n();
const localePath = useLocalePath();

const comparison = computed(() => [
  { typical: t('why.rows.waitTypical'), wildcard: t('why.rows.waitWildcard') },
  { typical: t('why.rows.castTypical'), wildcard: t('why.rows.castWildcard') },
  { typical: t('why.rows.memoryTypical'), wildcard: t('why.rows.memoryWildcard') },
  { typical: t('why.rows.sharedTypical'), wildcard: t('why.rows.sharedWildcard') },
]);

const faqs = computed(() => [
  { q: t('faq.replaceQ'), a: t('faq.replaceA') },
  { q: t('faq.privacyQ'), a: t('faq.privacyA') },
  { q: t('faq.spamQ'), a: t('faq.spamA') },
  { q: t('faq.sharingQ'), a: t('faq.sharingA') },
  { q: t('faq.selfHostQ'), a: t('faq.selfHostA') },
  { q: t('faq.platformsQ'), a: t('faq.platformsA') },
]);

const metaModels = computed(() => [
  { name: 'Muse Spark', use: t('meta.spark') },
  { name: 'Muse Image', use: t('meta.image') },
  { name: 'Muse Voice Transcribe', use: t('meta.transcribe') },
  { name: 'SAM', use: t('meta.sam') },
]);
</script>

<template>
  <main>
    <!-- Hero -->
    <section class="hero">
      <div class="container split hero-split">
        <div class="hero-copy">
          <span class="chip primary hero-chip"><SiteIcon name="meta" />{{ t('hero.chip') }}</span>
          <h1 class="hero-title">{{ t('hero.title') }}</h1>
          <p class="lead">{{ t('hero.lead') }}</p>
          <div class="hero-actions">
            <AppButton :to="site.appUrl" size="large" trailing-icon="chevron">{{ t('hero.meet') }}</AppButton>
            <AppButton :to="`${localePath('/')}#open-source`" variant="tonal" size="large">{{ t('hero.selfHost') }}</AppButton>
          </div>
        </div>
        <HeroScene />
      </div>
      <div class="container">
        <ul class="proof">
          <li><SiteIcon name="memory" /><span><strong>{{ t('hero.proof.memory') }}</strong><small>{{ t('hero.proof.memoryText') }}</small></span></li>
          <li><SiteIcon name="chat" /><span><strong>{{ t('hero.proof.proactive') }}</strong><small>{{ t('hero.proof.proactiveText') }}</small></span></li>
          <li><SiteIcon name="users" /><span><strong>{{ t('hero.proof.shareable') }}</strong><small>{{ t('hero.proof.shareableText') }}</small></span></li>
          <li><SiteIcon name="code" /><span><strong>{{ t('hero.proof.openSource') }}</strong><small>{{ t('hero.proof.openSourceText') }}</small></span></li>
        </ul>
      </div>
    </section>

    <!-- Why -->
    <section id="why" class="section">
      <div class="container">
        <div class="section-head centered reveal">
          <span class="eyebrow">{{ t('why.eyebrow') }}</span>
          <h2 class="section-title">{{ t('why.title') }} <span class="soft">{{ t('why.titleSoft') }}</span></h2>
          <p class="lead">{{ t('why.lead') }}</p>
        </div>
        <div class="compare reveal">
          <div class="compare-col typical">
            <h3>{{ t('why.typical') }}</h3>
            <ul><li v-for="row in comparison" :key="row.typical"><SiteIcon name="close" />{{ row.typical }}</li></ul>
          </div>
          <div class="compare-col wildcard">
            <h3><WildcardMark :size="24" />{{ t('why.wildcard') }}</h3>
            <ul><li v-for="row in comparison" :key="row.wildcard"><SiteIcon name="check" />{{ row.wildcard }}</li></ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Memory -->
    <section id="memory" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="brain" />{{ t('memory.eyebrow') }}</span>
          <h2 class="section-title">{{ t('memory.title') }} <span class="soft">{{ t('memory.titleSoft') }}</span></h2>
          <p class="lead">{{ t('memory.lead') }}</p>
          <i18n-t keypath="memory.separate" tag="p" class="lead" scope="global">
            <template #emphasis><strong>{{ t('memory.separateEmphasis') }}</strong></template>
          </i18n-t>
        </div>
        <MemoryScene class="reveal" />

        <div class="split flip catch-split">
          <div class="reveal">
            <span class="eyebrow"><SiteIcon name="transfer" />{{ t('catchUp.eyebrow') }}</span>
            <h3 class="sub-title">{{ t('catchUp.title') }}</h3>
            <p class="lead">{{ t('catchUp.lead') }}</p>
            <div class="points">
              <div class="point"><span class="disc"><SiteIcon name="lock" /></span><h3>{{ t('catchUp.permission') }}</h3><p>{{ t('catchUp.permissionText') }}</p></div>
              <div class="point"><span class="disc"><SiteIcon name="incognito" /></span><h3>{{ t('catchUp.private') }}</h3><p>{{ t('catchUp.privateText') }}</p></div>
            </div>
          </div>
          <CatchUpScene class="reveal delay-1" />
        </div>
      </div>
    </section>

    <!-- Initiative -->
    <section id="initiative" class="section">
      <div class="container split">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="bell" />{{ t('initiative.eyebrow') }}</span>
          <h2 class="section-title">{{ t('initiative.title') }}</h2>
          <p class="lead">{{ t('initiative.lead') }}</p>
          <p class="lead">{{ t('initiative.lead2') }}</p>
        </div>
        <InitiativeScene class="reveal delay-1" />
      </div>
    </section>

    <!-- Create -->
    <section id="contacts" class="section">
      <div class="container split flip">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="palette" />{{ t('create.eyebrow') }}</span>
          <h2 class="section-title">{{ t('create.title') }}</h2>
          <p class="lead">{{ t('create.lead') }}</p>
          <i18n-t keypath="create.sliders" tag="p" class="lead" scope="global">
            <template #count><strong>{{ t('create.slidersCount') }}</strong></template>
          </i18n-t>
        </div>
        <CreatorScene class="reveal delay-1" />
      </div>
    </section>

    <!-- Together -->
    <section id="together" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="handshake" />{{ t('together.eyebrow') }}</span>
          <h2 class="section-title">{{ t('together.title') }} <span class="soft">{{ t('together.titleSoft') }}</span></h2>
          <p class="lead">{{ t('together.lead') }}</p>
        </div>
        <SharedScene class="reveal" />
        <div class="points three">
          <div class="point reveal"><span class="disc"><SiteIcon name="memory" /></span><h3>{{ t('together.memory') }}</h3><p>{{ t('together.memoryText') }}</p></div>
          <div class="point reveal delay-1"><span class="disc"><SiteIcon name="chat" /></span><h3>{{ t('together.relay') }}</h3><p>{{ t('together.relayText') }}</p></div>
          <div class="point reveal delay-2"><span class="disc"><SiteIcon name="alarm" /></span><h3>{{ t('together.timers') }}</h3><p>{{ t('together.timersText') }}</p></div>
        </div>
      </div>
    </section>

    <!-- Groups -->
    <section id="groups" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="users" />{{ t('groups.eyebrow') }}</span>
          <h2 class="section-title">{{ t('groups.title') }}</h2>
          <p class="lead">{{ t('groups.lead') }}</p>
        </div>
        <GroupScene class="reveal" />
        <div class="points three">
          <div class="point reveal"><span class="disc neutral"><SiteIcon name="brain" /></span><h3>{{ t('groups.remember') }}</h3><p>{{ t('groups.rememberText') }}</p></div>
          <div class="point reveal delay-1"><span class="disc neutral"><SiteIcon name="routing" /></span><h3>{{ t('groups.context') }}</h3><p>{{ t('groups.contextText') }}</p></div>
          <div class="point reveal delay-2"><span class="disc neutral"><SiteIcon name="shield" /></span><h3>{{ t('groups.boundaries') }}</h3><p>{{ t('groups.boundariesText') }}</p></div>
        </div>
      </div>
    </section>

    <!-- For you -->
    <section id="for-you" class="section">
      <div class="container split">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="stars" />{{ t('forYou.eyebrow') }}</span>
          <h2 class="section-title">{{ t('forYou.title') }}</h2>
          <p class="lead">{{ t('forYou.lead') }}</p>
          <p class="lead">{{ t('forYou.lead2') }}</p>
        </div>
        <FeedScene class="reveal delay-1" />
      </div>
    </section>

    <!-- Connectors -->
    <section id="connectors" class="section">
      <div class="container split flip">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="plug" />{{ t('connectors.eyebrow') }}</span>
          <h2 class="section-title">{{ t('connectors.title') }}</h2>
          <p class="lead">{{ t('connectors.lead') }}</p>
          <p class="lead">{{ t('connectors.lead2') }}</p>
        </div>
        <ConnectorScene class="reveal delay-1" />
      </div>
    </section>

    <!-- More -->
    <section id="more" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="widget" />{{ t('more.eyebrow') }}</span>
          <h2 class="section-title">{{ t('more.title') }}</h2>
        </div>
        <MoreGrid />
      </div>
    </section>

    <!-- Meta -->
    <section class="section">
      <div class="container">
        <div class="meta-band reveal">
          <div>
            <span class="eyebrow"><SiteIcon name="meta" />{{ t('common.poweredByMeta') }}</span>
            <h2 class="sub-title">{{ t('meta.title') }}</h2>
          </div>
          <ul class="models">
            <li v-for="model in metaModels" :key="model.name"><strong>{{ model.name }}</strong><small>{{ model.use }}</small></li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Open source -->
    <section id="open-source" class="section">
      <div class="container split">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="code" />{{ t('common.openSource') }}</span>
          <h2 class="section-title">{{ t('openSource.title') }}</h2>
          <p class="lead">{{ t('openSource.lead') }}</p>
          <ul class="stack-list">
            <li><SiteIcon name="cloudflare" /><span><strong>Cloudflare</strong><small>{{ t('openSource.cloudflareText') }}</small></span></li>
            <li><SiteIcon name="meta" /><span><strong>{{ t('openSource.metaKey') }}</strong><small>{{ t('openSource.metaKeyText') }}</small></span></li>
            <li><SiteIcon name="elevenlabs" class="mono" /><span><strong>{{ t('openSource.elevenLabsKey') }}</strong><small>{{ t('openSource.elevenLabsKeyText') }}</small></span></li>
            <li><SiteIcon name="apple" class="mono" /><span><strong>{{ t('openSource.appleKeys') }}</strong><small>{{ t('openSource.appleKeysText') }}</small></span></li>
          </ul>
          <div class="hero-actions">
            <AppButton v-if="site.repositoryPublic" :to="site.repositoryUrl" variant="filled" size="large" trailing-icon="open-in-new">{{ t('openSource.viewSource') }}</AppButton>
            <span v-else class="chip soon-chip"><SiteIcon name="code" />{{ t('openSource.soon') }}</span>
          </div>
          <p class="footnote">{{ t('openSource.footnote') }}</p>
        </div>
        <TerminalScene class="reveal delay-1" />
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="section">
      <div class="container faq-wrap">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="question" />{{ t('faq.eyebrow') }}</span>
          <h2 class="section-title">{{ t('faq.title') }}</h2>
        </div>
        <div class="faq reveal">
          <details v-for="faq in faqs" :key="faq.q">
            <summary>{{ faq.q }}<SiteIcon name="chevron-down" class="faq-chevron" /></summary>
            <p>{{ faq.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="section">
      <div class="container">
        <div class="cta reveal">
          <div class="cta-cast" aria-hidden="true">
            <ContactAvatar v-for="who in (['mila', 'theo', 'ivy', 'pixel', 'nova', 'coco'] as const)" :key="who" :who="who" :size="64" />
          </div>
          <h2 class="section-title">{{ t('cta.title') }}</h2>
          <p class="lead">{{ t('cta.lead') }}</p>
          <div class="hero-actions centered">
            <AppButton :to="site.appUrl" size="large" trailing-icon="chevron">{{ t('common.getStarted') }}</AppButton>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* Hero */
.hero { position: relative; padding: clamp(24px, 5vw, 64px) 0 0; }
.hero::before {
  content: ''; position: absolute; inset: -20% 0 auto; height: 900px; z-index: -1; pointer-events: none;
  background:
    radial-gradient(40% 50% at 78% 30%, color-mix(in srgb, var(--md-primary) 16%, transparent), transparent 70%),
    radial-gradient(35% 40% at 15% 20%, color-mix(in srgb, var(--md-tertiary) 10%, transparent), transparent 70%);
}
.hero-chip { height: 32px; padding: 0 var(--space-3); border-radius: var(--md-shape-full); font-size: 13px; white-space: normal; }
.hero-chip svg { width: 16px; height: 16px; }
.hero-title { margin-top: var(--space-6); font: var(--type-hero); letter-spacing: var(--tracking-hero); text-wrap: balance; }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-8); }
.hero-actions.centered { justify-content: center; }
.proof {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: var(--space-3);
  margin: clamp(32px, 5vw, 56px) 0 0; padding: 0; list-style: none;
}
.proof li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border-radius: var(--md-shape-xl); background: var(--md-surface-container-low); }
.proof svg { width: 26px; height: 26px; flex: none; color: var(--md-primary); }
.proof span { display: flex; flex-direction: column; line-height: 1.3; }
.proof strong { font: var(--type-title-small); font-size: 15px; }
.proof small { font: var(--type-body-small); font-size: 13px; color: var(--md-on-surface-variant); }

/* Comparison */
.compare { display: grid; gap: var(--space-3); max-width: 920px; margin: 0 auto; }
@media (min-width: 760px) { .compare { grid-template-columns: 1fr 1fr; } }
.compare-col { padding: var(--space-6); border-radius: var(--site-radius); }
.compare-col h3 { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); font: var(--type-title-large); letter-spacing: var(--tracking-title); }
.compare-col ul { display: flex; flex-direction: column; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.compare-col li { display: flex; align-items: center; gap: var(--space-3); font: var(--type-body-large); }
.compare-col li svg { width: 22px; height: 22px; flex: none; }
.typical { background: var(--md-surface-container-low); color: var(--md-on-surface-variant); }
.typical li svg { color: var(--md-outline); }
.wildcard { background: var(--md-primary-container); color: var(--md-on-primary-container); }
.wildcard li { font-weight: 600; }
.wildcard li svg { color: var(--md-primary); }

.catch-split { margin-top: clamp(72px, 9vw, 120px); }

/* Meta band */
.meta-band {
  display: grid; gap: var(--space-6); align-items: center; padding: clamp(24px, 4vw, 48px); border-radius: var(--site-radius);
  background: var(--md-inverse-surface); color: var(--md-inverse-on-surface);
}
@media (min-width: 900px) { .meta-band { grid-template-columns: 0.9fr 1.1fr; } }
.meta-band .eyebrow { color: var(--md-inverse-primary); }
.models { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.models li { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) var(--space-4); border-radius: var(--md-shape-l); background: color-mix(in srgb, var(--md-inverse-on-surface) 8%, transparent); }
.models strong { font: var(--type-title-small); }
.models small { font: var(--type-body-small); opacity: 0.75; }

/* Open source */
.stack-list { display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-6) 0 0; padding: 0; list-style: none; }
.stack-list li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--md-shape-l); background: var(--md-surface-container-low); }
.stack-list svg { width: 24px; height: 24px; flex: none; color: var(--md-primary); }
/* Single-color brand marks (ElevenLabs, Apple) follow the text color in both themes. */
.stack-list svg.mono { color: var(--md-on-surface); fill: currentColor; }
.stack-list span { display: flex; flex-direction: column; line-height: 1.3; }
.stack-list strong { font: var(--type-title-small); font-size: 15px; }
.stack-list small { font: var(--type-body-small); font-size: 13px; color: var(--md-on-surface-variant); }
.soon-chip { height: 40px; padding: 0 var(--space-4); border-radius: var(--md-shape-full); font: var(--type-label-large); }
.soon-chip svg { width: 18px; height: 18px; }
.footnote { margin-top: var(--space-4); font: var(--type-body-small); color: var(--md-on-surface-variant); }

/* FAQ */
.faq-wrap { max-width: 860px; }
.faq { display: flex; flex-direction: column; gap: var(--ui-group-gap); border-radius: var(--ui-group-radius); overflow: hidden; }
.faq details { background: var(--md-surface-container-low); border-radius: var(--ui-group-item-radius); }
.faq summary {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-5) var(--space-6);
  min-height: 0; color: var(--md-on-surface); font: var(--type-title-medium); font-size: 17px; letter-spacing: var(--tracking-title);
}
.faq summary::before { display: none; }
.faq summary::-webkit-details-marker { display: none; }
.faq-chevron { width: 22px; height: 22px; flex: none; color: var(--md-on-surface-variant); transition: transform var(--md-motion-medium) var(--md-ease); }
.faq details[open] .faq-chevron { transform: rotate(180deg); }
.faq details p { padding: 0 var(--space-6) var(--space-6); font: var(--type-body-large); color: var(--md-on-surface-variant); }

/* Final CTA */
.cta {
  position: relative; overflow: hidden; padding: clamp(40px, 7vw, 88px) var(--space-6); border-radius: var(--site-radius); text-align: center;
  background:
    radial-gradient(60% 80% at 50% 0%, color-mix(in srgb, var(--md-primary) 18%, transparent), transparent 70%),
    var(--md-surface-container-low);
}
.cta .lead { max-width: 560px; margin-inline: auto; }
.cta-cast { display: flex; justify-content: center; margin-bottom: var(--space-8); }
.cta-cast > * { margin-left: -12px; box-shadow: 0 0 0 4px var(--md-surface-container-low); animation: bob 3.6s var(--md-ease) infinite; }
.cta-cast > *:first-child { margin-left: 0; }
.cta-cast > *:nth-child(2n) { animation-delay: -1.2s; }
.cta-cast > *:nth-child(3n) { animation-delay: -2.4s; }
@keyframes bob { 50% { transform: translateY(-6px); } }
</style>
