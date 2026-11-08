import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const expected = JSON.parse(
  readFileSync('tests/fixtures/expected.json', 'utf8'),
) as typeof import('../fixtures/expected.json');

async function scan(page: Page, fixture: string) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(`tests/fixtures/${fixture}`);
  await expect(page.getByRole('button', { name: /^(Cloak this photo|Masquer cette photo)$/ })).toBeVisible({
    timeout: 120_000,
  });
}

async function countMatchesRows(page: Page) {
  const total = Number(await page.getByTestId('intel-count').getAttribute('data-total'));
  const rows = await page
    .getByTestId('intel-row')
    .evaluateAll((els) => els.reduce((a, e) => a + Number((e as HTMLElement).dataset.count), 0));
  expect(total).toBeGreaterThan(0);
  expect(rows).toBe(total);
  return total;
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test.describe(`reduced motion: ${motion}`, () => {
    test.use({ reducedMotion: motion });

    test('street-gps.jpg: place, device, read text, faces, and a count equal to the rows', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await scan(page, 'street-gps.jpg');
      const e = expected['street-gps.jpg'];
      const file = page.getByTestId('intel-file');
      await expect(file).toContainText('(near Lyon, FR)');
      await expect(file).toContainText(`${e.metadata.make} ${e.metadata.model}`);
      await expect(file).toContainText(e.metadata.serial);
      await expect(file).toContainText(e.text[0]!.text);
      await expect(file).toContainText('3 faces');
      await expect(page.getByTestId('minimap')).toBeVisible();
      await expect(page.getByTestId('scan-overlay')).toHaveAttribute(
        'data-tier',
        motion === 'reduce' ? 'static' : /high|medium|low|static/,
      );
      await countMatchesRows(page);
    });
  });
}

test('plate.jpg: a licence plate is reported', async ({ page }) => {
  test.setTimeout(180_000);
  await scan(page, 'plate.jpg');
  await expect(page.getByTestId('intel-file')).toContainText('Licence plate');
  await countMatchesRows(page);
});

test('no-metadata.png: explains the missing metadata', async ({ page }) => {
  test.setTimeout(180_000);
  await scan(page, 'no-metadata.png');
  await expect(page.getByTestId('metadata-none')).toContainText('probably removed it already');
  await expect(page.getByTestId('minimap')).toHaveCount(0);
});

test('in French', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'fr' }).click();
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/street-gps.jpg');
  await expect(page.getByRole('button', { name: 'Masquer cette photo' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('intel-count')).toContainText('Cette photo révèle');
  await expect(page.getByTestId('intel-file')).toContainText('(près de Lyon, FR)');
  await countMatchesRows(page);
});
