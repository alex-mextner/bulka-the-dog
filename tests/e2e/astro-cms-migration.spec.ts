import { test, expect, type Page } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { translations } from '../../client/lib/translations';

async function ready(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#hero-title')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).__bulkaTest));
}

for (const width of [360, 390, 768, 1440]) {
  test.describe(`Astro layout ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 1, locale: 'ru-RU' });
    test('keeps all sections and photos without horizontal page overflow', async ({ page }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await ready(page);
      for (const id of ['appearance', 'habits', 'skills', 'health', 'conditions', 'faq', 'contact', 'gallery']) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      const broken = await page.evaluate(async () => {
        const images = [...document.querySelectorAll<HTMLImageElement>('main img')];
        await Promise.all(images.map(image => new Promise<void>(resolve => {
          image.loading = 'eager';
          if (image.complete) { resolve(); return; }
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        })));
        return images.filter(image => !image.naturalWidth).map(image => image.currentSrc || image.src);
      });
      expect(broken).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('Astro public behaviour', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, locale: 'ru-RU' });

  test('language switching updates content, document language, metadata and accessible controls', async ({ page }) => {
    await ready(page);
    for (const [locale, label, html] of [['rs', 'SR', 'sr'], ['en', 'EN', 'en'], ['ru', 'RU', 'ru']] as const) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('#hero-title')).toHaveText(translations[locale].hero.title);
      await expect(page.locator('html')).toHaveAttribute('lang', html);
      await expect(page).toHaveTitle(locale === 'ru' ? /Я Булка/ : locale === 'rs' ? /Ja sam Bulka/ : /I'm Bulka/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', translations[locale].hero.intro);
      await expect(page.getByRole('group', { name: translations[locale].accessibility.change_language })).toBeVisible();
      await expect(page.locator('[data-section-kind="hero"] [data-gallery-image]')).toHaveAttribute('aria-label', new RegExp(`^${translations[locale].accessibility.open_photo}:`));
    }
  });

  test('all navigation buttons reach their sections and FAQ remains a single-open accordion', async ({ page }) => {
    await ready(page);
    const nav = page.getByRole('navigation', { name: translations.ru.accessibility.sections }).first();
    for (const id of ['appearance', 'habits', 'skills', 'health', 'conditions', 'faq', 'contact', 'gallery']) {
      await nav.getByRole('button', { name: translations.ru.nav[id], exact: true }).click();
      await expect.poll(async () => page.locator(`#${id}`).evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(160);
    }
    await page.locator('#faq').scrollIntoViewIfNeeded();
    const questions = page.locator('#faq button[aria-expanded]');
    await questions.nth(0).click();
    await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await questions.nth(1).click();
    await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(questions.nth(1)).toHaveAttribute('aria-expanded', 'true');
    const panel = await questions.nth(1).getAttribute('aria-controls');
    await expect(page.locator(`[id="${panel}"]`)).toBeVisible();
  });

  test('hero lightbox preserves thirty entries, arrows, Escape, focus and page scrolling', async ({ page }) => {
    await ready(page);
    const trigger = page.locator('[data-section-kind="hero"] [data-gallery-image]');
    await trigger.click();
    await expect(page.locator('.yarl__portal')).toBeVisible();
    await expect(page.locator('.yarl__counter')).toHaveText(/1\s*\/\s*30/);
    await page.getByRole('button', { name: translations.ru.accessibility.next, exact: true }).click();
    await expect(page.locator('.yarl__counter')).toHaveText(/2\s*\/\s*30/);
    await page.getByRole('button', { name: translations.ru.accessibility.previous, exact: true }).click();
    await expect(page.locator('.yarl__counter')).toHaveText(/1\s*\/\s*30/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.yarl__portal')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/yarl__no_scroll/);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  });

  test('contact destinations remain unchanged and unknown paths return a real 404', async ({ page, request }) => {
    await ready(page);
    for (const name of ['telegram', 'whatsapp', 'instagram', 'phone']) {
      await expect(page.locator(`#contact a[href="${translations.ru.contact_links[`${name}_url`]}"]`)).toHaveCount(1);
    }
    const response = await request.get('/this-page-does-not-exist-astro-audit/');
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('id="hero-title"');
  });

  for (const [locale, path, html] of [['ru', '/', 'ru'], ['rs', '/rs/', 'sr'], ['en', '/en/', 'en']] as const) {
    test(`serves meaningful ${locale} content and metadata without JavaScript`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
      try {
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.locator('#hero-title')).toHaveText(translations[locale].hero.title);
        await expect(page.locator('#hero-title')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', html);
        await expect(page.locator('#faq button')).toHaveCount(8);
        await expect(page.locator('#contact a[href^="https://t.me/"]')).toHaveCount(1);
      } finally { await context.close(); }
    });
  }

  test('deployed editor bundle is public JavaScript with CORS', async ({ request, baseURL }) => {
    test.skip(!baseURL || /localhost|127\.0\.0\.1/.test(baseURL), 'Vercel applies these headers at deployment; Astro preview does not read vercel.json.');
    const bundle = process.env.CONLOCA_EDITOR_BUNDLE_PATH ||
      (await readdir('dist/_conloca')).find(file => /^editor-bundle\..*\.js$/.test(file));
    expect(bundle, 'Build output must contain an editor bundle').toBeTruthy();
    const path = bundle!.startsWith('/') ? bundle! : `/_conloca/${bundle}`;
    const response = await request.get(path, { headers: { Origin: 'https://cms.example.com' } });
    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['content-type']).toMatch(/javascript/);
  });
});
