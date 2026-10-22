import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

let fixtureHtml: string;
test.beforeAll(async () => {
  // Compile a test-only entry with the actual site components and React effects.
  // No fixture route, debug hook, or dependency is added to the deployed app.
  const result = await build({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    logLevel: 'error',
    resolve: { alias: { '@': fileURLToPath(new URL('../../client', import.meta.url)) } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('../fixtures/photo-fader.tsx', import.meta.url)), formats: ['iife'], name: 'PhotoFaderLifecycleFixture' },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const files = outputs.flatMap(output => 'output' in output ? output.output : []);
  const script = files.flatMap(file => file.type === 'chunk' ? [file.code] : []).join('\n');
  const css = files.flatMap(file => file.type === 'asset' && file.fileName.endsWith('.css') ? [String(file.source)] : []).join('\n');
  expect(script.length).toBeGreaterThan(0);
  fixtureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="fixture-root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`;
});

type Entry = { id: number; src: string; alt: string; caption?: string };
async function entries(page: Page): Promise<Entry[]> {
  return JSON.parse(await page.getByTestId('gallery-registry').textContent() || '[]');
}
async function openAndClose(page: Page, caption: string) {
  const button = page.locator('[data-desktop-photo-stick] [data-pinch-open-root]').first();
  await expect(button).toHaveAttribute('aria-label', new RegExp(caption));
  await button.click();
  await expect(page.locator('.yarl__portal')).toBeVisible();
  await expect(page.locator('.yarl__slide_current .yarl__slide_description')).toHaveText(caption);
  await page.keyboard.press('Escape');
  await expect(page.locator('.yarl__portal')).toHaveCount(0);
}

test('owned habit photos follow locale and media changes without removing shared entries', async ({ page }) => {
  await page.route('**/__bulka-tests/photo-fader', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }));
  await page.goto('/__bulka-tests/photo-fader');
  await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared registry entry']);
  const sharedId = (await entries(page))[0].id;

  await openAndClose(page, 'RU custom habit');
  await expect.poll(async () => (await entries(page)).length).toBe(2);
  const ruId = (await entries(page)).find(entry => entry.caption === 'RU custom habit')!.id;
  await page.getByRole('button', { name: 'Same photos', exact: true }).click();
  expect((await entries(page)).find(entry => entry.caption === 'RU custom habit')?.id).toBe(ruId);

  for (const [locale, caption] of [['en', 'EN custom habit'], ['rs', 'SR custom habit']] as const) {
    await page.getByRole('button', { name: `Locale ${locale}`, exact: true }).click();
    await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared registry entry']);
    await openAndClose(page, caption);
    await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared registry entry', caption]);
    expect((await entries(page))[0].id).toBe(sharedId);
  }

  await page.getByRole('button', { name: 'Change caption', exact: true }).click();
  await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared registry entry']);
  await openAndClose(page, 'SR custom habit 1');
  await page.getByRole('button', { name: 'Toggle habits', exact: true }).click();
  await expect.poll(async () => (await entries(page)).map(entry => entry.caption)).toEqual(['Shared registry entry']);
  expect((await entries(page))[0].id).toBe(sharedId);
});
