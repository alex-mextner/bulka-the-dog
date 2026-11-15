import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule } from 'node:vm';

// Run the real generator in an isolated project; never overwrite a developer's generated build constants.
async function generatedEnvironment(environment, moduleUrl) {
  const project = await mkdtemp(join(tmpdir(), 'editor-asset-origin-'));
  try {
    const script = join(project, 'scripts', 'public-environment.mjs');
    await mkdir(join(project, 'scripts'));
    await copyFile(new URL('../scripts/public-environment.mjs', import.meta.url), script);
    const { preparePublicEnvironment } = await import(pathToFileURL(script).href);
    preparePublicEnvironment(environment);
    const source = await readFile(join(project, 'src', 'generated', 'public-environment.ts'), 'utf8');
    const module = new SourceTextModule(stripTypeScriptTypes(source), {
      identifier: moduleUrl,
      initializeImportMeta(meta) { meta.url = moduleUrl; },
    });
    await module.link(() => assert.fail('The generated public module must be self-contained.'));
    await module.evaluate();
    return JSON.parse(JSON.stringify(module.namespace.publicEnvironment));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

for (const moduleUrl of [
  'https://published.example/_conloca/editor/site.0123456789abcdef.js',
  'https://preview.example/project/_conloca/editor/site.0123456789abcdef.js',
  'http://127.0.0.1:4173/_conloca/editor/site.0123456789abcdef.js',
]) {
  test(`public image URLs follow the delivered module at ${new URL(moduleUrl).origin}`, async () => {
    const value = await generatedEnvironment({ PUBLIC_SITE_URL: 'https://canonical.example' }, moduleUrl);
    assert.equal(value.publicBaseUrl, new URL(moduleUrl).origin);
    assert.equal(new URL('/images/sample.png', value.publicBaseUrl).href,
      `${new URL(moduleUrl).origin}/images/sample.png`);
    assert.equal(value.siteUrl, 'https://canonical.example');
    assert.equal(value.enableAnalytics, true);
  });
}

test('moving an existing build does not retain its former asset hostname', async () => {
  const value = await generatedEnvironment({
    CONLOCA_PUBLIC_BASE_URL: 'https://old-build.example',
    VERCEL_URL: 'another-build.example',
    PUBLIC_SITE_URL: 'https://canonical.example',
    PUBLIC_ENABLE_ANALYTICS: '0',
  }, 'https://new-build.example/_conloca/editor/site.js');
  assert.equal(value.publicBaseUrl, 'https://new-build.example');
  assert.equal(value.siteUrl, 'https://canonical.example');
  assert.equal(value.enableAnalytics, false);
});

test('file-based server rendering retains the explicit build fallback', async () => {
  const value = await generatedEnvironment({
    CONLOCA_PUBLIC_BASE_URL: 'https://configured.example',
  }, 'file:///workspace/site/dist/server/entry.mjs');
  assert.equal(value.publicBaseUrl, 'https://configured.example');
});
