import { expect, test, type Locator, type Page } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 });

let fixtureHtml: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    logLevel: 'error',
    resolve: { alias: { '@': fileURLToPath(new URL('../../client', import.meta.url)) } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false, minify: false,
      lib: { entry: fileURLToPath(new URL('../fixtures/cleared-photos.tsx', import.meta.url)), formats: ['iife'], name: 'ClearedPhotosFixture' },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const files = outputs.flatMap(output => 'output' in output ? output.output : []);
  const script = files.flatMap(file => file.type === 'chunk' ? [file.code] : []).join('\n');
  const css = files.flatMap(file => file.type === 'asset' && file.fileName.endsWith('.css') ? [String(file.source)] : []).join('\n');
  expect(script.length).toBeGreaterThan(0);
  // Match the real page root: modal isolation hides #root while YARL owns focus.
  fixtureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`;
});

type Entry = { id: number; src: string; alt: string; caption?: string };
async function entries(page: Page): Promise<Entry[]> {
  return JSON.parse(await page.getByTestId('gallery-registry').textContent() || '[]');
}

async function pinchOpen(page: Page, trigger: Locator, caption: string) {
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeInViewport({ ratio: 1 });
  // Dispatch the real DOM touch lifecycle, without calling gallery internals.
  // A post-hooks null guard that loses the native listener cannot pass this.
  await trigger.evaluate(element => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const touches = (distance: number) => [-1, 1].map((side, index) => new Touch({
      identifier: index + 1, target: element,
      clientX: x + side * distance / 2, clientY: y,
      pageX: x + side * distance / 2 + window.scrollX, pageY: y + window.scrollY,
    }));
    element.dispatchEvent(new TouchEvent('touchstart', { touches: touches(70), bubbles: true, cancelable: true }));
    window.dispatchEvent(new TouchEvent('touchmove', { touches: touches(140), bubbles: true, cancelable: true }));
    window.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.yarl__portal')).toBeVisible();
  await expect(page.locator('.yarl__slide_current .yarl__slide_description')).toHaveText(caption);
  await page.keyboard.press('Escape');
  await expect(page.locator('.yarl__portal')).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function prepare(page: Page, query: string) {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.resourceType() === 'image') requests.push(request.url());
  });
  await page.route('**/__bulka-tests/cleared-photos*', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }));
  await page.goto(`/__bulka-tests/cleared-photos?${query}`);
  await expect(page.getByRole('button', { name: 'Restore source', exact: true })).toBeVisible();
  return { errors, requests };
}

for (const start of ['valid', 'empty'] as const) {
  test(`GalleryImage and PhotoStrip clear and restore from ${start} without stale entries, cards, requests or listeners`, async ({ page }) => {
    const { errors, requests } = await prepare(page, `start=${start}`);
    const trigger = page.getByTestId('editable-gallery-image').locator('button');
    if (start === 'valid') {
      await expect.poll(async () => (await entries(page)).length).toBe(3);
      await pinchOpen(page, trigger, 'Editable entry');
    } else {
      await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared entry']);
      await expect(trigger).toHaveCount(0);
    }
    const sharedId = (await entries(page)).find(entry => entry.caption === 'Shared entry')!.id;

    for (const action of ['Clear source', 'Whitespace source']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(trigger).toHaveCount(0);
      await expect(page.getByTestId('editable-strip').locator('img')).toHaveCount(0);
      await expect(page.getByText('Editable strip card', { exact: true })).toHaveCount(0);
      await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared entry']);
      expect((await entries(page))[0].id).toBe(sharedId);
      await page.getByRole('button', { name: 'Restore source', exact: true }).click();
      await expect.poll(async () => (await entries(page)).length).toBe(3);
      await expect(page.getByTestId('editable-strip').locator('img')).toHaveCount(1);
      await pinchOpen(page, trigger, 'Editable entry');
    }
    expect(requests.some(url => new URL(url).pathname === '/__bulka-tests/cleared-photos'), 'blank img sources never fetch the document as an image').toBe(false);
    expect(errors).toEqual([]);
  });
}

test('habit photos keep their item index and restore pinch controls after a source is cleared', async ({ page }) => {
  const { errors, requests } = await prepare(page, 'mode=habits');
  const trigger = page.locator('[data-desktop-photo-stick] [data-pinch-open-root]');
  await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared entry']);
  await expect(trigger).toHaveCount(1);
  await pinchOpen(page, trigger, 'First habit photo');
  await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared entry', 'First habit photo']);
  const sharedId = (await entries(page))[0].id;

  for (const action of ['Clear source', 'Whitespace source']) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(trigger).toHaveCount(0);
    await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared entry']);
    expect((await entries(page))[0].id).toBe(sharedId);
    expect(await page.locator('img').evaluateAll(images => images.some(img => !(img.getAttribute('src') || '').trim()))).toBe(false);

    // A missing first image must not shift the second habit's photo into it.
    const second = page.locator('[data-habit-item]').nth(1);
    await second.evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 25));
    await expect(trigger).toHaveAttribute('aria-label', /Second habit photo/);
    await pinchOpen(page, trigger, 'Second habit photo');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(trigger).toHaveCount(0);

    await page.getByRole('button', { name: 'Restore source', exact: true }).click();
    await expect(trigger).toHaveCount(1);
    await pinchOpen(page, trigger, 'First habit photo');
  }
  expect(requests.some(url => new URL(url).pathname === '/__bulka-tests/cleared-photos')).toBe(false);
  expect(errors).toEqual([]);
});
