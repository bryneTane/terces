import { expect, test } from '@playwright/test';
import { scanToReview } from './flow.ts';

test('the scan says what it is doing, and back never leaves a photo', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await expect(page.getByTestId('scan-progress')).toBeVisible();
  await expect(page.getByTestId('scan-progress').getByRole('status')).toHaveText(/\.\.\.|%/);
  await scanToReview(page);
  const url = page.url();

  await page.goBack();
  await page.goBack();
  expect(page.url()).toBe(url);
  await expect(page.getByTestId('zone-layer')).toBeVisible();

  // The About page is a page of its own: back returns from it to the photo.
  await page.evaluate(() => (location.hash = 'about'));
  await expect(page.getByTestId('zone-layer')).toBeHidden();
  await page.goBack();
  await expect(page.getByTestId('zone-layer')).toBeVisible();
});
