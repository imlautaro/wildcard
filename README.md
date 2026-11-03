<p align="center">
  <a href="https://wildcard-site.imlautaro.workers.dev">
    <img src="apps/web/public/icon.svg" width="88" alt="Wildcard">
  </a>
</p>

<h1 align="center">Wildcard</h1>

<p align="center">
  <strong>AI contacts that text you first.</strong><br>
  Create a cast of AI contacts, each with their own name, face, personality and memory.<br>
  They reach out on their own, remember what matters, and work together with you and the people you love.
</p>

<p align="center">
  <a href="https://wildcard-web.imlautaro.workers.dev"><strong>Try it</strong></a> ·
  <a href="https://wildcard-site.imlautaro.workers.dev">Website</a> ·
  <a href="https://wildcard-docs.imlautaro.workers.dev/en">Docs</a> ·
  <!-- TODO: add the demo video link here once it is published -->
  <a href="https://wildcard-docs.imlautaro.workers.dev/es">Documentación en español</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Powered%20by-Meta%20AI%20models-0467DF?logo=meta&logoColor=white" alt="Powered by Meta AI models">
  <img src="https://img.shields.io/badge/Runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white" alt="Runs on Cloudflare Workers">
  <img src="https://img.shields.io/badge/iOS%20%2B%20Web-SwiftUI%20%C2%B7%20Nuxt-111111" alt="iOS and web">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <img src=".github/assets/hero.png" width="900" alt="A bakery-launch group chat with two people and two AI contacts on the web, and the chats list on iPhone">
</p>

## Chatbots wait. Contacts show up.

Most AI apps are a single text box that answers when asked. Wildcard is closer to your phone's
contact list: different characters with their own lives, who keep the conversation going.

| | A typical AI chat | A Wildcard contact |
| --- | --- | --- |
| **Who starts** | Waits for you to type | Reaches out first, then gives you space |
| **Who you talk to** | One assistant for everything | A cast of contacts, each with a personality |
| **Memory** | One memory for every chat, or none | A separate memory for each contact |
| **Who's there** | Just you and a text box | Shared with family, friends and groups |

### One memory per contact. Zero cross-contamination.

Theo knows your bakery launch inside out. Ivy knows your marathon plan. Pixel knows you're stuck on
entropy. None of them brings up the others' business, unless you want them to. New contact? Ask it to
check with one who already knows: Nova asks Theo and picks up where you left off, without you
repeating a word. Mark a chat private and nothing can learn from it.
→ [Memory and privacy](https://wildcard-docs.imlautaro.workers.dev/en/features/memory-and-privacy)

<img src=".github/assets/web-catchup.png" alt="Nova catches up on the bakery launch by asking Theo">

### They text first.

Contacts follow up on the interview you mentioned, share a thought they had later, or check in after a
quiet week, timed to when you're usually around. If a message goes unanswered, they wait until you
write back. Switch initiative off for any contact, any time. → [Initiative](docs/initiative.md)

### Create anyone.

Cartoon characters, anime heroes, 3D movie stars, realistic people, adorable pets, or a style you
describe yourself. Wildcard generates the portrait, a name and a personality, and you fine-tune them
with 17 temperament sliders. → [Accounts and contacts](https://wildcard-docs.imlautaro.workers.dev/en/features/accounts-and-contacts)

<p align="center">
  <img src=".github/assets/styles.png" width="760" alt="The same app generating cartoon, anime, 3D animated, realistic, pet and custom robot characters">
</p>

### Share a contact. Keep your own chat.

Invite your partner, a friend or your family to one of your contacts. Each of you gets a private chat,
while the contact remembers what matters across all of them. It remembers facts, never full
transcripts, and can pass a message along signed with your name. → [Sharing](docs/sharing.md)

<p align="center">
  <img src=".github/assets/share-contact.png" width="760" alt="Alex and Sam each chat privately with Coco, who remembers the family dates for both">
</p>

### Group chats where the AI pulls its weight.

Put several contacts in a group and invite real people too. Ask for something big and they split it
up: tasks with owners, work that waits on other work, and a shared document at the end.
→ [Groups](docs/groups.md)

<img src=".github/assets/web-tasks.png" alt="Nova split the soft-opening prep into a task board; Theo finished the prep plan and is working on pricing">

### A feed written by your contacts.

As your contacts learn what you care about, they keep a feed of updates just for you: headlines,
trackers and lists, refreshed automatically. Comment on a post and the contact who wrote it answers.
→ [For you](https://wildcard-docs.imlautaro.workers.dev/en/features/for-you)

<img src=".github/assets/web-foryou.png" alt="For you feed with Ivy's marathon tracker and Coco's family dates">

### And everything that makes them feel real

- 🔌 **Their own tools.** Connect MCP servers once and decide which contact gets what (GitHub, Notion, Linear and 30+ more). → [Agentic work](https://wildcard-docs.imlautaro.workers.dev/en/features/agentic-work)
- 🧩 **Mini apps.** Trackers and small tools a contact builds for you, rendered natively. Coco built a family tracker on its own in the demo.
- 🔎 **Research and documents.** Ask a question, get a sourced report saved as a document you can both edit.
- ⏰ **Reminders and scheduled messages**, **page monitors**, **voice messages**, **stickers** cut out of any photo, and **pictures and selfies** from your contacts. → [Media](https://wildcard-docs.imlautaro.workers.dev/en/features/media)
- 🌗 **iPhone and web**, in English and Spanish, light and dark.

<sub>Every contact, portrait, group photo and message in these screenshots was generated live by the app with Meta models on a demo account.</sub>

## Built with Meta AI

Four Meta models through the Meta API, each with one job:

| Model | What it does in Wildcard |
| --- | --- |
| **Muse Spark 1.3** | Every reply, proactive message, memory update, group decision, web research, For you post and mini app |
| **Muse Image 1.0** | Contact portraits, selfies and images sent in chat |
| **SAM 3.1** | Cuts stickers out of photos |
| **Muse Voice Transcribe 1.0** | Turns voice messages into text the contact can answer |

→ [How Wildcard calls the models](https://wildcard-docs.imlautaro.workers.dev/en/cloudflare/ai)

## How it works

```mermaid
flowchart LR
  ios[iPhone app<br/>SwiftUI] --> api
  web[Web app<br/>Nuxt on Workers] --> api
  admin[Admin panel] -. AdminAPI .-> api
  api[API Worker<br/>Hono + Better Auth] --> d1[(D1)]
  api --> r2[(R2<br/>photos)]
  api --> wf[Workflows + Cron<br/>replies and initiative]
  wf --> meta[Meta API<br/>Muse Spark · Muse Image<br/>SAM · Voice]
  api --> push[APNs + Web Push]
```

Everything runs on Cloudflare: Workers, D1, R2, Workflows and Cron. No servers to manage.
→ [Architecture](https://wildcard-docs.imlautaro.workers.dev/en/getting-started/architecture)

## Run it yourself

### Locally

```bash
git clone https://github.com/imlautaro/wildcard && cd wildcard
npm ci
cp .env.example .env    # add META_API_KEY; optional ELEVENLABS_API_KEY for voices
npm run setup           # .dev.vars, auth secret and local D1 with every migration
npm run dev:all         # API on http://localhost:8787 + web app on http://localhost:3000
```

Open http://localhost:3000 and create an account. Use Node.js 24 (`.nvmrc`). No Cloudflare account
is needed locally: Wrangler emulates D1, R2, Workflows and the every-minute Cron. `npm run setup`
copies the keys from `.env` into `apps/api/.dev.vars` without printing them. Ports busy? Set
`API_PORT` / `WEB_PORT` (in `.env` or the shell). `npm run smoke` checks sign-up, a chat and a model
reply end to end.

### On your own Cloudflare account

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/imlautaro/wildcard)

The button copies this repository to your GitHub account, asks for `META_API_KEY` (optional
`ELEVENLABS_API_KEY`) and connects Cloudflare Workers Builds, which deploys the API and the web app
on every push. Keep the Worker name `wildcard-api`.

Or with GitHub Actions:

1. Fork this repository.
2. In the fork, **Settings → Secrets and variables → Actions**: add the secrets
   `CLOUDFLARE_API_TOKEN` and `META_API_KEY` (optional `ELEVENLABS_API_KEY`), and the variable
   `WILDCARD_DEPLOY=true`.
3. Enable Actions in the fork and run the **Deploy** workflow (or push to `main`).

The first run creates the D1 database, the private R2 bucket, the API Worker with its Workflows
and Cron, and the web app at `https://wildcard-web.<your-subdomain>.workers.dev`. Nothing in the
repository needs editing: account, resources and URLs are resolved at release time. Prefer
Cloudflare Workers Builds, custom domains or the admin panel? See
[Provisioning](https://wildcard-docs.imlautaro.workers.dev/en/operations/provisioning) and
[Environment variables](https://wildcard-docs.imlautaro.workers.dev/en/getting-started/environment-variables).
`npm run release:check` previews what a release would do with your Wrangler login.

The iOS app and every local option are covered in
[Local development](https://wildcard-docs.imlautaro.workers.dev/en/getting-started/local-development).

## Repository

| Path | What it is |
| --- | --- |
| [`apps/api`](apps/api) | Hono API Worker: auth, chats, contacts, Workflows |
| [`apps/web`](apps/web) | Nuxt web app |
| [`apps/ios`](apps/ios) | SwiftUI iPhone app, widgets, share and notification extensions |
| [`apps/admin`](apps/admin) | Super admin panel |
| [`apps/site`](apps/site) · [`apps/docs`](apps/docs) | Marketing site and documentation (English and Spanish) |
| [`packages/ui`](packages/ui) | Shared design system for web and admin |
| [`docs/`](docs) | In-depth design notes for every feature; start with the [developer guide](docs/README.md) |

## Meta AI Developer Hackathon

Wildcard was built for the [Meta AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
(October 26 – November 4, 2026), Indie Developer track. <!-- TODO: one line on what existed before the event, matching the video -->

## Contributing

Issues and pull requests are welcome. Start with the
[contributing guide](https://wildcard-docs.imlautaro.workers.dev/en/operations/contributing).

## License

[MIT](LICENSE). Bundled third-party assets keep their own terms: the Manrope font
is under the SIL Open Font License (`OFL.txt` next to each copy), the notification
sounds are from Mixkit under its license, and connector logos are trademarks of
their respective owners.
