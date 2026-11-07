import { scanToReview } from './flow.ts';
import { expect, test } from '@playwright/test';

test('a file that is not an image shows a clear message and a way out', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'broken.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('this is not a photo'),
  });
  await expect(page.getByRole('alert')).toContainText('could not be opened as an image');
  await page.getByRole('button', { name: 'Try another photo' }).click();
  await expect(page.getByTestId('file-input')).toBeAttached();
});

test('when the result fails verification, sharing and download are blocked', async ({ page }) => {
  test.setTimeout(180_000);
  // Fault injection: the JPEG encoder returns bytes that are not a readable JPEG.
  await page.addInitScript(() => {
    const junk = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
    const offscreen = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (opts) {
      return opts?.type === 'image/jpeg' ? Promise.resolve(junk()) : offscreen.call(this, opts);
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      if (type === 'image/jpeg') cb(junk());
      else toBlob.call(this, cb, type, q);
    };
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await scanToReview(page);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('alert')).toContainText('we blocked sharing');
  await expect(page.getByRole('button', { name: /^(Share|Download)$/ })).toHaveCount(0);
});
