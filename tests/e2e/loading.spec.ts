import { expect, test } from '@playwright/test';
import { settled } from './flow.ts';

// Requests from a service worker bypass page.route: run these without one.
test.use({ serviceWorkers: 'block' });

test('while models are still loading, review, drawing and cloaking work', async ({ page }) => {
  test.setTimeout(180_000);
  // Hold every model download: the scanner never becomes ready during this test.
  await page.route('**/models/*.onnx', () => {});
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await expect(
    page.getByRole('heading', { name: 'Looking through your photo, on this device.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Skip to review' }).click();
  await expect(page.getByRole('heading', { name: 'Choose what to cover' })).toBeVisible();
  await expect(page.getByText('All 6 metadata groups are removed, always.')).toBeVisible();
  await settled(page);

  const box = (await page.getByTestId('zone-layer').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="zone"][data-category="manual"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('summary')).toContainText('6 metadata');
});

test('when the scanner cannot load, the app switches to manual mode with a message', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/models/manifest.json', (r) => r.fulfill({ status: 500, body: '' }));
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await expect(page.getByRole('heading', { name: 'Choose what to cover' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('manual-mode')).toContainText('The scanner could not load');
  await expect(page.getByRole('button', { name: 'Cloak' })).toBeEnabled();
});
