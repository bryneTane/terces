import { scanToReview } from './flow.ts';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { verifyNoMetadata } from '../../src/lib/export.ts';

test('after one visit, the whole flow works with the network off', async ({ page, context }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/');
  // Service worker installed and every model cached in the background.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect(page.locator('html[data-offline-ready="true"]')).toBeAttached({ timeout: 180_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-badge')).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await scanToReview(page);
  expect(await page.locator('[data-testid="zone"][data-category="face"]').count()).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('offline-badge')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  const bytes = new Uint8Array(readFileSync((await download.path())!));
  expect((await verifyNoMetadata(bytes)).issues).toEqual([]);
});
