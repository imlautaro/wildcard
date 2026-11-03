// End-to-end check of a running installation through the web app, like a browser:
// sign up a throwaway account, create a contact, send a message and wait for the
// model's reply (npm run smoke -- http://localhost:3000 or your production web URL).
// It proves the web proxy, auth, D1, Workflows and META_API_KEY work together.
// The account it creates stays; delete it from the app's Account settings if needed.
const base = (process.argv[2] ?? `http://localhost:${process.env.WEB_PORT || 3000}`).replace(/\/+$/, '');
const timeoutSeconds = Number(process.env.SMOKE_TIMEOUT_SECONDS || 180);
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(base + path, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'same-origin', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...cookie.split('; ').filter(Boolean), ...set.map((value) => value.split(';')[0])].join('; ');
  const text = await response.text();
  try { return { status: response.status, json: JSON.parse(text) }; } catch { return { status: response.status, json: null }; }
}

function step(label, result, ok = result.status < 300) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (HTTP ${result.status})`);
  if (!ok) {
    if (result.json?.error) console.log(`     ${result.json.error}`);
    process.exit(1);
  }
}

console.log(`Smoke test against ${base}`);
step('sign up', await call('POST', '/api/v1/auth/sign-up/email', {
  email: `smoke-${Date.now()}@example.com`, password: `Smoke-${crypto.randomUUID()}`, name: 'Smoke Test',
}));
const created = await call('POST', '/api/v1/contacts', { name: 'Smoke' });
step('create contact', created);
const chat = `/api/v1/contacts/${created.json.contact.id}/chat/turns`;
step('send message', await call('POST', chat, {
  id: crypto.randomUUID(), text: 'Hi! Reply with one short sentence about your day.', historyRevision: 0,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}));

const started = Date.now();
while (Date.now() - started < timeoutSeconds * 1000) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const turn = (await call('GET', chat)).json?.turns?.find((item) => item.userText);
  if (turn?.status === 'complete' && turn.assistantText) {
    console.log(`ok   model reply after ${Math.round((Date.now() - started) / 1000)} s: "${turn.assistantText.slice(0, 120)}"`);
    process.exit(0);
  }
  if (turn?.status === 'failed' || turn?.errorCode) {
    console.log(`FAIL model reply: ${turn.errorCode ?? turn.status}. Check META_API_KEY and the API Worker logs.`);
    process.exit(1);
  }
}
console.log(`FAIL no model reply within ${timeoutSeconds} s. Check the Workflows and the API Worker logs.`);
process.exit(1);
