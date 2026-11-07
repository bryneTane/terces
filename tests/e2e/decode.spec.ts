import { expect, test } from '@playwright/test';

// Uses the device lab page, which decodes with imageOrientation: 'from-image' like the app.
test('applies EXIF orientation when decoding (rotated.jpg displays upright)', async ({ page }) => {
  await page.goto('/lab.html');
  await page.locator('#pick').setInputFiles('tests/fixtures/rotated.jpg');
  await expect(page.locator('#out')).toContainText('300x400');
});

test('lab reports the GPS and identity fields of street-gps.jpg', async ({ page }) => {
  await page.goto('/lab.html');
  await page.locator('#pick').setInputFiles('tests/fixtures/street-gps.jpg');
  await expect(page.locator('#status')).toContainText('GPS PRESENT');
  await expect(page.locator('#out')).toContainText('SerialNumber');
});
