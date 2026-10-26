import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((_error, c) => {
  console.error(JSON.stringify({ event: 'unhandled_request_error' }));
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
