import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** After picking a photo: wait for the scan report, press Cloak this photo, land on Review. */
export async function scanToReview(page: Page, timeout = 120_000) {
  await expect(page.getByRole('button', { name: 'Cloak this photo' })).toBeVisible({ timeout });
  await page.getByRole('button', { name: 'Cloak this photo' }).click();
  await expect(page.getByRole('heading', { name: 'Choose what to cover' })).toBeVisible();
  await settled(page);
}

/** Waits for the screen transition to finish, so element positions are final. */
export async function settled(page: Page) {
  await expect(page.locator('[data-testid="screen"][data-glitch]')).toHaveCount(0);
}

/** Picks the solid mask for every zone type, so tests can check covered pixels are near black. */
export async function chooseSolid(page: Page) {
  for (const radio of await page.getByRole('radio', { name: 'Solid' }).all())
    await radio.check({ force: true });
}

/** Pick a fixture and run through to the result screen. Returns the cloaked JPEG bytes. */
export async function cloakFixture(page: Page, fixture: string, solid = false) {
  // Force the download fallback so the test reads the exact bytes a user would get.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(`tests/fixtures/${fixture}`);
  await scanToReview(page);
  const zones = await page.getByTestId('zone').count();
  if (solid) await chooseSolid(page);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });
  const src = await page.getByTestId('result-image').locator('img').first().getAttribute('src');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^terces-cloaked-\d{8}-\d{4}\.jpg$/);
  const bytes = new Uint8Array(readFileSync((await download.path())!));
  return { zones, bytes, src: src! };
}

/** Sample RGB values of the displayed result image at image-pixel coordinates. */
export async function samplePixels(page: Page, src: string, points: [number, number][]) {
  return page.evaluate(
    async ({ src, points }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]);
    },
    { src, points },
  );
}
