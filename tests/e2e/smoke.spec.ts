import { expect, test } from '@playwright/test';
import { CSP } from '../../config/headers.ts';

test('loads with the privacy headers and cross-origin isolation', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toBe(CSP);
  await expect(page.getByRole('main')).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});
