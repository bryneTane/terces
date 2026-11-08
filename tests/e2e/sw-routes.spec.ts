import { expect, test } from '@playwright/test';

// Cloudflare Access finishes its login at /cdn-cgi/access/authorized, where the server sets the
// cookie: the service worker must let that (and every server page) through to the network.
test('the service worker answers app pages only, server pages go to the network', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // now controlled by the service worker
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  for (const path of ['/cdn-cgi/access/authorized?nonce=1&state=2', '/admin'])
    expect((await page.goto(path))!.fromServiceWorker(), path).toBe(false);
  expect((await page.goto('/?source=pwa'))!.fromServiceWorker()).toBe(true);
});
