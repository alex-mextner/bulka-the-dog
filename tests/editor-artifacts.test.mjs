import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import handler from '../api/conloca-editor.js';

function render(referer) {
  let html;
  const headers = new Map();
  const response = {
    setHeader(name, value) { headers.set(name, value); },
    status(code) { assert.equal(code, 200); return response; },
    send(value) { html = value; },
  };
  handler({ headers: { referer } }, response);
  const json = (id) => JSON.parse(html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>(.*?)</script>`))?.[1] ?? '{}');
  return { html, headers, data: json('conloca-editor-host') };
}

test('the editor endpoint names a complete content-addressed build', async () => {
  const { data } = render('https://workspace.conloca.com/');
  const source = JSON.parse(await readFile(new URL('../editor-source.json', import.meta.url), 'utf8'));
  assert.equal(data.site, `/_conloca/editor/${source.module}`, 'Loader and pinned build must agree');
  assert.match(data.site, /^\/_conloca\/editor\/site\.[a-f0-9]{16}\.js$/);
  const read = (path) => readFile(new URL(`../public${path}`, import.meta.url));
  const module = await read(data.site);
  const digest = createHash('sha256').update(module).digest('hex');
  assert.equal(digest, source.sha256, 'The complete pinned module digest must match');
  assert.ok(data.site.endsWith(`site.${digest.slice(0, 16)}.js`));
  for (const path of [...data.css, data.sandboxFrame]) assert.ok((await read(path)).byteLength > 0);
  const info = JSON.parse((await read(data.info)).toString());
  const manifest = await read(`/_conloca/editor/${info.componentManifest.path}`);
  assert.equal(createHash('sha256').update(manifest).digest('hex'), info.componentManifest.sha256);
  assert.equal(info.siteId, data.siteId);
});

test('production and review workspaces share the same component bytes without widening frame trust', () => {
  const production = render('https://workspace.conloca.com/');
  const review = render('https://workspace.pr615.conloca.com/');
  const unrelated = render('https://workspace.conloca.com.attacker.example/');
  assert.deepEqual(review.data, production.data);
  assert.match(production.html, /https:\/\/app\.conloca\.com\/host\/v1\/entry\.js/);
  assert.match(review.html, /https:\/\/app\.pr615\.conloca\.com\/host\/v1\/entry\.js/);
  assert.match(unrelated.html, /https:\/\/app\.conloca\.com\/host\/v1\/entry\.js/);
  assert.equal(unrelated.html.includes('attacker.example'), false);
  assert.equal(production.headers.get('cache-control'), 'no-store');
  assert.equal(production.headers.get('vary'), 'Referer');
});
