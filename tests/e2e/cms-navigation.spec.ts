import { expect, test } from '@playwright/test';
import { translations } from '../../client/lib/translations';

for (const pathname of ['/', '/en/adoption-details/']) {
  test(`hero buttons stay on the current page when their CMS sections are absent (${pathname})`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bulka-language', 'en'));
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__bulkaTest));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // Use the actual hydrated page/handlers with the DOM produced by removing
    // those optional CMS blocks. A second case sets a non-home current URL.
    await page.evaluate(path => {
      history.replaceState(null, '', path);
      document.querySelectorAll('[data-section-kind="contact"], [data-section-kind="appearance"]').forEach(section => section.remove());
    }, pathname);
    const before = page.url();
    await page.locator('[data-hero-cta]').click();
    await expect(page).toHaveURL(before);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: translations.en.cta.learn_more, exact: true }).click();
    await expect(page).toHaveURL(before);
    await expect(page.locator('#hero-title')).toBeVisible();
  });
}
