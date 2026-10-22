import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const routes = [['ru', '/', 'index.html'], ['sr', '/rs/', 'rs/index.html'], ['en', '/en/', 'en/index.html']];

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'bulka-build-settings-'));
  try {
    await mkdir(join(directory, 'scripts'), { recursive: true });
    await mkdir(join(directory, 'client'), { recursive: true });
    for (const file of ['scripts/public-environment.mjs', 'scripts/check-site-metadata.mjs', 'vitest.config.ts']) {
      await copyFile(join(repository, file), join(directory, file));
    }
    await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
    await symlink(join(repository, 'node_modules'), join(directory, 'node_modules'), 'dir');
    await writeFile(join(directory, 'client/bootstrap.spec.ts'), `
import { expect, test } from 'vitest';
import { publicEnvironment } from '../src/generated/public-environment';
test('the real config provides the public module', () => expect(publicEnvironment.siteUrl).toBeTruthy());
`);
    const generator = await import(pathToFileURL(join(directory, 'scripts/public-environment.mjs')).href);
    await run(directory, generator);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runNode(directory, args) {
  // A test process with no public build overrides must not replace the saved
  // settings. The fixture also receives no application credentials.
  const result = spawnSync(process.execPath, args, {
    cwd: directory, env: { PATH: process.env.PATH || '', LANG: 'C.UTF-8', CI: '1' },
    encoding: 'utf8', timeout: 30_000, maxBuffer: 512 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.slice(-4000);
  assert.equal(result.error, undefined, output);
  return { status: result.status, output };
}

function runVitest(directory) {
  const result = runNode(directory, [
    join(repository, 'node_modules/vitest/vitest.mjs'), 'run',
    '--root', directory, '--config', join(directory, 'vitest.config.ts'),
    '--maxWorkers', '1', '--reporter', 'dot',
  ]);
  assert.equal(result.status, 0, result.output);
}

async function writeBuiltMetadata(directory, settings) {
  for (const [language, pathname, file] of routes) {
    const canonical = new URL(pathname, settings.siteUrl).href;
    const social = new URL('/og-image.jpg', settings.siteUrl).href;
    const html = `<!doctype html><html lang="${language}"><head>
<link rel="canonical" href="${canonical}">
${routes.map(([locale, path]) => `<link rel="alternate" hreflang="${locale}" href="${new URL(path, settings.siteUrl).href}">`).join('\n')}
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${social}"><meta name="twitter:image" content="${social}">
<script type="application/ld+json">${JSON.stringify({ mainEntityOfPage: { '@id': canonical }, inLanguage: language })}</script>
${settings.enableAnalytics ? '<script src="https://cloud.umami.is/script.js"></script>' : ''}
</head><body></body></html>`;
    const path = join(directory, 'dist', file);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, html);
  }
}

const buildOverrides = {
  PUBLIC_SITE_URL: 'https://my-bulka.example/',
  CONLOCA_PUBLIC_BASE_URL: 'https://preview-bulka.example',
  PUBLIC_ENABLE_ANALYTICS: 'false',
};

test('metadata verification honors the configured build SEO origin and rejects a mismatched canonical', async () => {
  await fixture(async (directory, generator) => {
    const settings = generator.preparePublicEnvironment(buildOverrides);
    await writeBuiltMetadata(directory, settings);
    const valid = runNode(directory, ['scripts/check-site-metadata.mjs']);
    assert.equal(valid.status, 0, valid.output);
    const path = join(directory, 'dist/index.html');
    const html = await readFile(path, 'utf8');
    await writeFile(path, html.replace(`rel="canonical" href="${buildOverrides.PUBLIC_SITE_URL}"`, 'rel="canonical" href="https://bulka.rs/"'));
    const invalid = runNode(directory, ['scripts/check-site-metadata.mjs']);
    assert.notEqual(invalid.status, 0, 'an incorrect canonical must still fail');
    assert.match(invalid.output, /ru canonical/);
  });
});

test('the actual Vitest bootstrap preserves existing build settings without matching process env', async () => {
  await fixture(async (directory, generator) => {
    const settings = generator.preparePublicEnvironment(buildOverrides);
    await writeBuiltMetadata(directory, settings);
    const path = join(directory, 'src/generated/public-environment.ts');
    const before = await readFile(path, 'utf8');
    runVitest(directory);
    assert.equal(await readFile(path, 'utf8'), before, 'Vitest must not overwrite the settings that produced dist');
    const checked = runNode(directory, ['scripts/check-site-metadata.mjs']);
    assert.equal(checked.status, 0, checked.output);
  });
});

test('a fresh Vitest checkout initializes settings and a later build can replace them', async () => {
  await fixture(async (directory, generator) => {
    runVitest(directory);
    const path = join(directory, 'src/generated/public-environment.ts');
    const initial = await readFile(path, 'utf8');
    const settings = generator.preparePublicEnvironment(buildOverrides);
    const rebuilt = await readFile(path, 'utf8');
    assert.notEqual(rebuilt, initial, 'Astro preparation must remain updateable for the next build');
    assert.equal(settings.enableAnalytics, false);
    assert.ok(rebuilt.includes(buildOverrides.PUBLIC_SITE_URL));
  });
});
