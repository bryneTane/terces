import { expect, test } from '@playwright/test';
import { cloakFixture } from './flow.ts';

// Requests made by a service worker are invisible to page.route and page events: audit without it.
test.use({ serviceWorkers: 'block' });

test('a full flow makes no request to any other origin, and only two anonymous ticks', async ({
  page,
  baseURL,
  browserName,
}) => {
  test.setTimeout(240_000);
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const hits: {
    type: string | undefined;
    body: string | null;
    cookie: string | undefined;
    credentials: boolean;
  }[] = [];
  // `vite preview` has no Pages Functions: answer the counter like production does.
  await page.route('**/api/hit', async (route) => {
    const r = route.request();
    const headers = await r.allHeaders();
    hits.push({
      type: headers['content-type'],
      body: r.postData(),
      cookie: headers['cookie'],
      credentials: 'authorization' in headers,
    });
    await route.fulfill({ status: 204 });
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'blob:' || u.protocol === 'data:') return;
    if (u.origin !== origin) foreign.push(r.url());
  });
  await cloakFixture(page, 'street-gps.jpg');
  await expect.poll(() => hits.length).toBe(2);
  expect(foreign).toEqual([]);
  // Playwright's WebKit does not expose beacon bodies; Chromium checks them, and the unit tests
  // check what the client puts in the body on every engine.
  if (browserName !== 'webkit') expect(hits.map((h) => h.body).sort()).toEqual(['cloak', 'scan']);
  for (const h of hits) {
    expect(h.type).toMatch(/^text\/plain/);
    expect(h.cookie).toBeUndefined();
    expect(h.credentials).toBe(false);
  }
});
