import { expect, test, type Page } from '@playwright/test';
import { chooseSolid, samplePixels, scanToReview } from './flow.ts';

const W = 1600;
const H = 1257;

async function toReview(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await scanToReview(page);
  const box = (await page.getByTestId('zone-layer').boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + (x / W) * box.width, y: box.y + (y / H) * box.height });
  return { at };
}

test('deselect a face, draw a zone, cloak: the face stays, the drawn area is masked', async ({ page }) => {
  test.setTimeout(240_000);
  const { at } = await toReview(page);
  const face = at(773, 295);
  const covered = page.locator('[data-testid="zone"][data-category="face"][data-selected="true"]');
  const before = await covered.count();
  await page.mouse.click(face.x, face.y);
  await expect(covered).toHaveCount(before - 1);
  await expect(page.getByRole('button', { name: /: stays visible/ }).first()).toBeVisible();

  // Draw over the lower-right corner, where nothing is detected.
  const a = at(1350, 1000);
  const b = at(1550, 1200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="zone"][data-category="manual"]')).toHaveCount(1);

  await chooseSolid(page);
  await page.getByRole('button', { name: 'Cloak' }).click();
  await expect(page.getByRole('heading', { name: 'Cloaked' })).toBeVisible({ timeout: 60_000 });
  const src = (await page.getByTestId('result-image').locator('img').first().getAttribute('src'))!;
  const [facepx, drawn, other] = await samplePixels(page, src, [
    [773, 295],
    [1450, 1100],
    [401, 526],
  ]);
  expect(Math.max(...facepx!)).toBeGreaterThan(60); // deselected face left visible
  expect(Math.max(...drawn!)).toBeLessThan(40); // drawn zone masked
  expect(Math.max(...other!)).toBeLessThan(40); // other faces still masked

  // Edit zones goes back to review with the zones kept.
  await page.getByRole('button', { name: 'Edit zones' }).click();
  await expect(page.getByRole('heading', { name: 'Choose what to cover' })).toBeVisible();
  await expect(page.locator('[data-testid="zone"][data-category="manual"]')).toHaveCount(1);
  await page.getByTestId('zone-remove').click();
  await expect(page.locator('[data-testid="zone"][data-category="manual"]')).toHaveCount(0);
});
