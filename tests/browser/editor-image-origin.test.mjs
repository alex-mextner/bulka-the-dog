import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="110"><rect width="180" height="110" rx="12" fill="#d9ece7"/><path d="m20 88 44-55 26 32 24-20 46 43" fill="#397f6b"/><circle cx="139" cy="27" r="12" fill="#dbac52"/></svg>';

async function serve(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

// Compile the actual asset resolver and actual generated environment, not a second implementation of either.
async function compileFixture(directory) {
  const generator = join(directory, 'scripts', 'public-environment.mjs');
  await mkdir(join(directory, 'scripts'));
  await copyFile(join(repository, 'scripts/public-environment.mjs'), generator);
  const { preparePublicEnvironment } = await import(pathToFileURL(generator).href);
  preparePublicEnvironment({ PUBLIC_SITE_URL: 'https://canonical.example', PUBLIC_ENABLE_ANALYTICS: '0' });
  const entry = join(directory, 'entry.ts');
  await writeFile(entry, `
import { publicEnvironment } from './src/generated/public-environment';
import { resolveSectionAssets } from ${JSON.stringify(join(repository, 'client/cms/content-model.ts'))};
const external = document.body.dataset.external;
const authored = {
  photos: [
    { label: 'Public root', src: '/images/sample.svg' },
    { label: 'Deployment subpath', src: '/project/images/sample.svg' },
    { label: 'External absolute', src: external + '/images/sample.svg' },
    { label: 'Managed media', src: '/assets/sample.svg' },
  ],
};
const before = JSON.stringify(authored);
const rendered = resolveSectionAssets(authored, publicEnvironment.publicBaseUrl, false);
for (const photo of rendered.photos) {
  const figure = document.createElement('figure');
  const img = document.createElement('img'); img.alt = photo.label; img.src = photo.src;
  const caption = document.createElement('figcaption'); caption.textContent = photo.label;
  figure.append(img, caption); document.querySelector('main').append(figure);
}
window.assetProof = { authored, rendered, unchanged: before === JSON.stringify(authored), origin: publicEnvironment.publicBaseUrl };
`);
  const result = await build({
    configFile: false, root: repository, logLevel: 'error',
    build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: 'fixture' } },
  });
  const chunks = [result].flat().flatMap(item => item.output).filter(item => item.type === 'chunk');
  assert.equal(chunks.length, 1, 'The neutral fixture must be one relocatable module.');
  return chunks[0].code;
}

test('a compiled editor module loads public images when moved between serving origins', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'editor-image-browser-'));
  const servers = [];
  let browser;
  try {
    const code = await compileFixture(directory);
    const external = await serve((_req, res) => res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(image));
    servers.push(external.server);
    const siteHandler = (req, res) => {
      const path = new URL(req.url, 'http://fixture.invalid').pathname;
      if (path.endsWith('.svg')) return res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(image);
      if (path.endsWith('/site.js')) return res.writeHead(200, { 'content-type': 'text/javascript' }).end(code);
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><head>
<style>body{margin:0;padding:24px;font:16px system-ui;background:#f4f5f6;color:#253036}main{display:grid;grid-template-columns:repeat(2,220px);gap:20px}figure{margin:0;padding:20px;background:white;border:1px solid #ddd;border-radius:12px}img{width:180px;height:110px}figcaption{margin-top:12px}</style>
</head><body data-external="${external.origin}"><h2>Editor image fixture</h2><p>Real compiled asset resolution; unchanged authored content.</p><main></main><script type="module" src="/project/_conloca/editor/site.js"></script></body></html>`);
    };
    const sites = [await serve(siteHandler), await serve(siteHandler)];
    servers.push(...sites.map(site => site.server));
    const shell = await serve((req, res) => {
      const index = new URL(req.url, 'http://fixture.invalid').searchParams.get('site') === '1' ? 1 : 0;
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body style="margin:0;background:#253036"><iframe title="Hosted canvas" style="border:0;width:100%;height:650px" src="${sites[index].origin}/project/_conloca/editor/"></iframe></body></html>`);
    });
    servers.push(shell.server);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 620, height: 650 }, deviceScaleFactor: 1 });
    const failedRequests = [];
    page.on('requestfailed', request => failedRequests.push(request.url()));
    for (let index = 0; index < sites.length; index++) {
      await page.goto(`${shell.origin}/?site=${index}`, { waitUntil: 'networkidle' });
      const frame = page.frame({ url: `${sites[index].origin}/project/_conloca/editor/` });
      assert.ok(frame, 'The cross-origin editor canvas must exist.');
      await frame.waitForFunction(() => window.assetProof !== undefined);
      // Record the actual pre-assertion surface, including the broken-image result on an unfixed generator.
      if (process.env.EDITOR_ASSET_PROOF_DIR) {
        await mkdir(process.env.EDITOR_ASSET_PROOF_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.EDITOR_ASSET_PROOF_DIR, `origin-${index}.png`) });
      }
      const result = await frame.evaluate(() => ({
        proof: window.assetProof,
        images: [...document.images].map(img => ({ src: img.currentSrc, loaded: img.complete && img.naturalWidth > 0 })),
      }));
      assert.deepEqual(result.images.map(img => img.loaded), [true, true, true, true], JSON.stringify(result));
      assert.equal(result.proof.origin, sites[index].origin);
      assert.equal(result.proof.unchanged, true);
      assert.equal(result.images[0].src, `${sites[index].origin}/images/sample.svg`);
      assert.equal(result.images[1].src, `${sites[index].origin}/project/images/sample.svg`);
      assert.equal(result.proof.rendered.photos[2].src, `${external.origin}/images/sample.svg`);
      assert.equal(result.proof.rendered.photos[3].src, '/assets/sample.svg');
    }
    assert.deepEqual(failedRequests, []);
  } finally {
    await browser?.close();
    await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
    await rm(directory, { recursive: true, force: true });
  }
});
