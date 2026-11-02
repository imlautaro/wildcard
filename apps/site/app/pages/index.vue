<script setup lang="ts">
// The landing page. Copy follows what the app actually does (docs/*.md); see
// docs/site.md before changing a claim.
const comparison = [
  { typical: 'Waits for you to type', wildcard: 'Reaches out first, then gives you space' },
  { typical: 'One assistant for everything', wildcard: 'A cast of contacts, each with a personality' },
  { typical: 'One memory for every chat, or none', wildcard: 'A separate memory for each contact' },
  { typical: 'Just you and a text box', wildcard: 'Shared with family, friends and groups' },
];

const faqs = [
  {
    q: 'Is Wildcard trying to replace ChatGPT, Claude or Grok?',
    a: 'No. Wildcard won\'t drive your browser, run code in a sandbox or spin up a virtual machine, and it isn\'t trying to. Keep using those tools for that. Wildcard is about the part of AI that feels like people: contacts with their own personality and memory, who stay in touch and work alongside you and the people around you.',
  },
  {
    q: 'Who can see what I tell a contact?',
    a: 'Your contacts are yours. If you share one, it remembers short facts across its participants (never full transcripts), and both sides agree to that when the contact is shared. Turn on "Keep this chat private" and nothing from that chat leaves it: not to groups, not to other people, not to your other contacts.',
  },
  {
    q: 'Will my contacts spam me?',
    a: 'No. They reach out when there\'s something worth saying, around the times you usually reply. If one message goes unanswered, they wait for you to write back. You can switch initiative off for any contact, or just tell it to stop.',
  },
  {
    q: 'How do contacts learn about each other\'s projects?',
    a: 'Only when you allow it. Link two contacts, or turn on "Contacts share with each other", and you can ask one to check with another. Private chats and chats with connected tools are never part of it.',
  },
  {
    q: 'Can I really run it myself?',
    a: 'Yes. Wildcard is open source and built entirely on Cloudflare: Workers, D1, R2 and Workflows. Deploy it to your own Cloudflare account and bring your own API keys: a Meta Model API key for the models, and optionally ElevenLabs for voices and Apple keys for iPhone notifications.',
  },
  {
    q: 'Where does it run?',
    a: 'Wildcard has a native iPhone app and a web app. A few native extras, like timers and alarms on someone else\'s phone, are iPhone only.',
  },
];

const metaModels = [
  { name: 'Muse Spark', use: 'Conversations, memory and initiative' },
  { name: 'Muse Image', use: 'Portraits, selfies and pictures' },
  { name: 'Muse Voice Transcribe', use: 'Voice message transcripts' },
  { name: 'SAM', use: 'Sticker cutouts' },
];
</script>

<template>
  <main>
    <!-- Hero -->
    <section class="hero">
      <div class="container split hero-split">
        <div class="hero-copy">
          <span class="chip primary hero-chip"><SiteIcon name="meta" />Powered by Meta AI models · Open source</span>
          <h1 class="hero-title">AI contacts that text you&nbsp;first.</h1>
          <p class="lead">
            Create a cast of AI contacts, each with their own name, face, personality and memory.
            They reach out on their own, remember what matters, and work together with you and the people you love.
          </p>
          <div class="hero-actions">
            <AppButton :to="site.appUrl" size="large" trailing-icon="chevron">Meet your first contacts</AppButton>
            <AppButton to="/#open-source" variant="tonal" size="large">Self-host it</AppButton>
          </div>
        </div>
        <HeroScene />
      </div>
      <div class="container">
        <ul class="proof">
          <li><SiteIcon name="memory" /><span><strong>One memory per contact</strong><small>No cross-chat bleed</small></span></li>
          <li><SiteIcon name="chat" /><span><strong>Proactive by design</strong><small>They message first</small></span></li>
          <li><SiteIcon name="users" /><span><strong>Shareable</strong><small>Family, friends, groups</small></span></li>
          <li><SiteIcon name="code" /><span><strong>Open source</strong><small>Self-host on Cloudflare</small></span></li>
        </ul>
      </div>
    </section>

    <!-- Why -->
    <section id="why" class="section">
      <div class="container">
        <div class="section-head centered reveal">
          <span class="eyebrow">Why Wildcard</span>
          <h2 class="section-title">Chatbots wait. <span class="soft">Contacts show up.</span></h2>
          <p class="lead">
            Most AI apps are a single text box that answers when asked. Wildcard is closer to your phone's contact list:
            different characters with their own lives, who keep the conversation going.
          </p>
        </div>
        <div class="compare reveal">
          <div class="compare-col typical">
            <h3>A typical AI chat</h3>
            <ul><li v-for="row in comparison" :key="row.typical"><SiteIcon name="close" />{{ row.typical }}</li></ul>
          </div>
          <div class="compare-col wildcard">
            <h3><WildcardMark :size="24" />A Wildcard contact</h3>
            <ul><li v-for="row in comparison" :key="row.wildcard"><SiteIcon name="check" />{{ row.wildcard }}</li></ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Memory -->
    <section id="memory" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="brain" />Memory, without the mess</span>
          <h2 class="section-title">One memory per contact. <span class="soft">Zero cross&#8209;contamination.</span></h2>
          <p class="lead">
            In most AI apps, memory is all or nothing. Turn it off and every chat starts from zero. Turn it on and
            everything you've ever said leaks into everything else: your bakery launch shows up in your training plan,
            your exam in your business ideas.
          </p>
          <p class="lead">
            In Wildcard, <strong>each contact keeps its own memory</strong>. Theo knows your bakery launch inside out. Ivy
            knows your marathon plan. Pixel knows you're stuck on entropy. None of them brings up the others' business,
            unless you want them to.
          </p>
        </div>
        <MemoryScene class="reveal" />

        <div class="split flip catch-split">
          <div class="reveal">
            <span class="eyebrow"><SiteIcon name="transfer" />Catch me up</span>
            <h3 class="sub-title">New contact? Ask it to check with one who already knows.</h3>
            <p class="lead">
              Want Nova to help with a project Theo has followed for weeks? Just say so. Nova asks Theo, gets the context it
              needs and picks up where you left off, without you repeating a word.
            </p>
            <div class="points">
              <div class="point"><span class="disc"><SiteIcon name="lock" /></span><h3>Only with your permission</h3><p>Contacts talk to each other when you've linked them, or turned on sharing between your contacts.</p></div>
              <div class="point"><span class="disc"><SiteIcon name="incognito" /></span><h3>Private stays private</h3><p>Mark a chat private and no other contact, group or person can learn from it.</p></div>
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
          <span class="eyebrow"><SiteIcon name="bell" />Initiative</span>
          <h2 class="section-title">They text first.</h2>
          <p class="lead">
            Wildcard contacts don't sit in silence until you type. They follow up on the interview you mentioned, share a
            thought they had later, or check in after a quiet week, timed to when you're usually around.
          </p>
          <p class="lead">
            And they read the room: if a message goes unanswered, they wait until you write back. Switch initiative off for
            any contact, any time.
          </p>
        </div>
        <InitiativeScene class="reveal delay-1" />
      </div>
    </section>

    <!-- Create -->
    <section id="contacts" class="section">
      <div class="container split flip">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="palette" />Create anyone</span>
          <h2 class="section-title">A cast as varied as your group chat.</h2>
          <p class="lead">
            Cartoon characters, anime heroes, 3D movie stars, realistic people, adorable pets, or a style you describe
            yourself, like retro video game robots. Wildcard generates the portrait, a name and a personality, all yours to
            edit.
          </p>
          <p class="lead">
            Fine-tune who they are with <strong>17 temperament sliders</strong>, from humor and warmth to patience, how
            often they reach out and how many emoji they use.
          </p>
        </div>
        <CreatorScene class="reveal delay-1" />
      </div>
    </section>

    <!-- Together -->
    <section id="together" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="handshake" />Better together</span>
          <h2 class="section-title">Share a contact. <span class="soft">Keep your own chat.</span></h2>
          <p class="lead">
            Invite your partner, a friend or your family to one of your contacts. Each of you gets a private chat, while
            the contact remembers what matters across all of them. Tell it something in the morning, and it can answer
            your sister about it in the afternoon.
          </p>
        </div>
        <SharedScene class="reveal" />
        <div class="points three">
          <div class="point reveal"><span class="disc"><SiteIcon name="memory" /></span><h3>Shared memory, private chats</h3><p>Everyone talks to the contact on their own. It remembers facts, never full transcripts.</p></div>
          <div class="point reveal delay-1"><span class="disc"><SiteIcon name="chat" /></span><h3>Pass a message along</h3><p>"Tell Sam I'm bringing dinner." The contact delivers it to Sam's private chat, signed with your name.</p></div>
          <div class="point reveal delay-2"><span class="disc"><SiteIcon name="alarm" /></span><h3>Timers on their phone</h3><p>With their permission, a shared contact can set a timer or alarm on the other person's iPhone.</p></div>
        </div>
      </div>
    </section>

    <!-- Groups -->
    <section id="groups" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="users" />Groups</span>
          <h2 class="section-title">Group chats where the AI pulls its weight.</h2>
          <p class="lead">
            Put several contacts in a group, and invite real people too, who can bring their own contacts along. Ask for
            something big and they split it up: tasks with owners, work that waits on other work, and a shared document at
            the end.
          </p>
        </div>
        <GroupScene class="reveal" />
        <div class="points three">
          <div class="point reveal"><span class="disc neutral"><SiteIcon name="brain" /></span><h3>Everyone remembers the group</h3><p>What's said in a group stays with every contact in it, and only reaches the private chats of its members.</p></div>
          <div class="point reveal delay-1"><span class="disc neutral"><SiteIcon name="routing" /></span><h3>Context moves like it would with people</h3><p>Ask a contact in private what the group decided. Allow it, and it can bring your private context to the group.</p></div>
          <div class="point reveal delay-2"><span class="disc neutral"><SiteIcon name="shield" /></span><h3>You set the boundaries</h3><p>Sharing private chats with a group is off by default, per contact and per group.</p></div>
        </div>
      </div>
    </section>

    <!-- For you -->
    <section id="for-you" class="section">
      <div class="container split">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="stars" />For you</span>
          <h2 class="section-title">A feed written by your contacts.</h2>
          <p class="lead">
            As your contacts learn what you care about, they keep a feed of updates just for you: headlines, scores,
            prices, charts and trackers, refreshed automatically. Mention you're eyeing a new MacBook Pro, and the news
            shows up there.
          </p>
          <p class="lead">
            Comment on a post and the contact who wrote it answers, or picks the conversation up with you in private.
          </p>
        </div>
        <FeedScene class="reveal delay-1" />
      </div>
    </section>

    <!-- Connectors -->
    <section id="connectors" class="section">
      <div class="container split flip">
        <div class="reveal">
          <span class="eyebrow"><SiteIcon name="plug" />Connectors</span>
          <h2 class="section-title">Give each contact its own tools.</h2>
          <p class="lead">
            Connect MCP servers once, then decide which contact gets what. Your work contact reads Linear, your coach sees
            your calendar, your study partner keeps notes in Notion. Over 30 connectors are ready to add, or bring your
            own server.
          </p>
          <p class="lead">
            Every tool starts off until you approve it, and a chat with connected tools stays out of shared memory.
          </p>
        </div>
        <ConnectorScene class="reveal delay-1" />
      </div>
    </section>

    <!-- More -->
    <section id="more" class="section">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="widget" />And the little things</span>
          <h2 class="section-title">Everything that makes them feel real.</h2>
        </div>
        <MoreGrid />
      </div>
    </section>

    <!-- Meta -->
    <section class="section">
      <div class="container">
        <div class="meta-band reveal">
          <div>
            <span class="eyebrow"><SiteIcon name="meta" />Powered by Meta AI models</span>
            <h2 class="sub-title">Conversations, portraits, voice notes and stickers, all on Meta's models.</h2>
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
          <span class="eyebrow"><SiteIcon name="code" />Open source</span>
          <h2 class="section-title">Yours to run, down to the last Worker.</h2>
          <p class="lead">
            Wildcard is open source and built entirely on Cloudflare. Deploy the whole thing to your own Cloudflare account
            with your own API keys. Your contacts, your data, your infrastructure.
          </p>
          <ul class="stack-list">
            <li><SiteIcon name="cloudflare" /><span><strong>Cloudflare</strong><small>Workers, D1, R2, Workflows and Cron</small></span></li>
            <li><SiteIcon name="meta" /><span><strong>Meta Model API key</strong><small>Required: conversations, images and transcripts</small></span></li>
            <li><SiteIcon name="elevenlabs" class="mono" /><span><strong>ElevenLabs key</strong><small>Optional: contact voices</small></span></li>
            <li><SiteIcon name="apple" class="mono" /><span><strong>Apple developer keys</strong><small>Optional: iPhone notifications and native extras</small></span></li>
          </ul>
          <div class="hero-actions">
            <AppButton v-if="site.repositoryPublic" :to="site.repositoryUrl" variant="filled" size="large" trailing-icon="open-in-new">View the source</AppButton>
            <span v-else class="chip soon-chip"><SiteIcon name="code" />Repository going public soon</span>
          </div>
          <p class="footnote">Model and voice usage is billed by those providers under your own keys.</p>
        </div>
        <TerminalScene class="reveal delay-1" />
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="section">
      <div class="container faq-wrap">
        <div class="section-head reveal">
          <span class="eyebrow"><SiteIcon name="question" />FAQ</span>
          <h2 class="section-title">Good questions.</h2>
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
          <h2 class="section-title">Meet your first five contacts.</h2>
          <p class="lead">Sign up, tell Wildcard a little about yourself, and it introduces you to five contacts made for you.</p>
          <div class="hero-actions centered">
            <AppButton :to="site.appUrl" size="large" trailing-icon="chevron">Get started</AppButton>
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
