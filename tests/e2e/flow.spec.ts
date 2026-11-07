import { expect, test } from '@playwright/test';
import { verifyNoMetadata } from '../../src/lib/export.ts';
import { readFileSync } from 'node:fs';
const expected = JSON.parse(
  readFileSync('tests/fixtures/expected.json', 'utf8'),
) as typeof import('../fixtures/expected.json');
import { cloakFixture, samplePixels } from './flow.ts';

test('cloaks street-gps.jpg: no metadata, faces and sign covered', async ({ page }) => {
  test.setTimeout(240_000);
  const { zones, bytes, src } = await cloakFixture(page, 'street-gps.jpg', true);
  expect(zones).toBeGreaterThanOrEqual(4); // 3 faces + the sign

  const v = await verifyNoMetadata(bytes);
  expect(v.issues).toEqual([]);

  await expect(page.getByTestId('summary')).toContainText('6 metadata, 3 faces');

  const sign = expected['street-gps.jpg'].text[0]!.box;
  // Face centres measured on group-faces.jpg (same pixels): Collins, Armstrong, Aldrin.
  const points: [number, number][] = [
    [sign.x + sign.w / 2, sign.y + sign.h / 2],
    [773, 295],
    [401, 526],
    [1160, 545],
  ];
  for (const [r, g, b] of await samplePixels(page, src, points)) {
    expect(Math.max(r!, g!, b!)).toBeLessThan(40); // solid near-black mask (JPEG tolerance)
  }
});
