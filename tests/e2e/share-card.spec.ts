import { scanToReview } from './flow.ts';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('the warning card carries the count, never the photo', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/');
  // A solid magenta photo: any magenta pixel in the card would mean the photo leaked into it.
  const magenta = await page.evaluate(async () => {
    const c = new OffscreenCanvas(800, 600);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 800, 600);
    const b = await c.convertToBlob({ type: 'image/png' });
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'magenta.png', mimeType: 'image/png', buffer: Buffer.from(magenta) });
  await scanToReview(page);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Share the warning' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('terces-warning.png');
  const png = readFileSync((await download.path())!);
  await info.attach('card', { body: png, contentType: 'image/png' });

  const stats = await page.evaluate(
    async (bytes) => {
      const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let magentaish = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i]! > 200 && d[i + 1]! < 80 && d[i + 2]! > 200) magentaish++;
      return { w: img.width, h: img.height, magentaish };
    },
    [...png],
  );
  expect(stats).toEqual({ w: 1080, h: 1350, magentaish: 0 });
});

test('the warning card can be downloaded even where the share sheet is available', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
  });
  await page.goto('/');
  const png = await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 300);
    c.getContext('2d')!.fillRect(0, 0, 400, 300);
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  });
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'dark.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await scanToReview(page);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download the warning card' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('terces-warning.png');
  await expect(page.getByRole('status')).toHaveText('Saved to your device.');
});
