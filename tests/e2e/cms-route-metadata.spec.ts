import { expect, test, type Page } from '@playwright/test';
import { translations } from '../../client/lib/translations';

test.use({ locale: 'en-US', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const siteUrl = process.env.PUBLIC_SITE_URL || 'https://bulka.rs';

async function expectRouteIdentity(page: Page, pathname: string) {
  const canonical = new URL(pathname, siteUrl).href;
  expect(new URL(page.url()).pathname).toBe(pathname);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  await expect.poll(async () => {
    const text = await page.locator('script[type="application/ld+json"]').first().textContent();
    return JSON.parse(text || '{}').mainEntityOfPage?.['@id'];
  }).toBe(canonical);
}

test('automatic English content on / keeps the identity of the requested route', async ({ page }) => {
  // A fresh Playwright context has no stored language choice.
  await page.goto('/');
  await expect(page.locator('#hero-title')).toHaveText(translations.en.hero.title);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => localStorage.getItem('bulka-language'))).toBeNull();
  await expectRouteIdentity(page, '/');
});

test('manual language changes on /en/ preserve the route identity', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.locator('#hero-title')).toHaveText(translations.en.hero.title);
  await page.waitForFunction(() => Boolean((window as unknown as { __bulkaTest?: unknown }).__bulkaTest));
  for (const [locale, label, html] of [['rs', 'SR', 'sr'], ['ru', 'RU', 'ru']] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#hero-title')).toHaveText(translations[locale].hero.title);
    await expect(page.locator('html')).toHaveAttribute('lang', html);
    await expectRouteIdentity(page, '/en/');
  }
});
