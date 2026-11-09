import { expect, test } from '@playwright/test';
import { cloakFixture, scanToReview, settled } from './flow.ts';

// rotated.jpg shows as a portrait photo: narrower than its frame, as most phone photos are.
test('the before/after line goes where the photo is pressed', async ({ page }) => {
  await cloakFixture(page, 'rotated.jpg');
  await settled(page);
  const photo = page.getByTestId('result-image').getByRole('img', { name: 'After' });
  const slider = page.getByRole('slider', { name: 'Compare before and after' });
  await photo.scrollIntoViewIfNeeded();
  const p = (await photo.boundingBox())!;
  const s = (await slider.boundingBox())!;
  expect(Math.abs(s.x - p.x)).toBeLessThan(2);
  expect(Math.abs(s.width - p.width)).toBeLessThan(2);

  const line = page.locator('[data-compare] span.bg-accent').first();
  for (const share of [0.2, 0.75]) {
    await page.mouse.click(p.x + share * p.width, p.y + p.height / 2);
    const l = (await line.boundingBox())!;
    expect(Math.abs(l.x + l.width / 2 - (p.x + share * p.width))).toBeLessThan(4);
  }
});

test('on a phone the save button is on screen without scrolling', async ({ page }) => {
  await cloakFixture(page, 'rotated.jpg');
  await settled(page);
  await expect(page.getByTestId('save-actions').getByRole('button', { name: 'Download' })).toBeInViewport();
});

test('the result opens at its top, wherever Review was scrolled', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await scanToReview(page);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeAttached({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByTestId('result-image')).toBeInViewport();
});
