import { expect, test } from '@playwright/test';
import { CSP } from '../../config/headers.ts';

test('loads with the privacy headers and cross-origin isolation', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toBe(CSP);
  await expect(page.getByRole('main')).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test('a section link from the About page lands on that section', async ({ page, isMobile }) => {
  const nav = () =>
    isMobile ? page.locator('#mobile-nav') : page.getByRole('banner').getByRole('navigation');
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
  await nav().getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/#about$/);
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
  await nav().getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/#privacy$/);
  await expect(page.locator('#privacy-title')).toBeInViewport();
});
