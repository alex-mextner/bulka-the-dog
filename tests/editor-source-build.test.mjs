import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyVerifiedEditorModule } from '../scripts/editor-artifact.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'editor-artifact-'));
  try {
    const source = join(root, 'source'); const target = join(root, 'target');
    await mkdir(source); await mkdir(target);
    const bytes = Buffer.from('export const origin = new URL(import.meta.url).origin;\n');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const spec = { module: `site.${sha256.slice(0, 16)}.js`, sha256, unchanged: ['site.css', 'manifest.json'] };
    await writeFile(join(source, spec.module), bytes);
    for (const name of spec.unchanged) {
      await writeFile(join(source, name), 'unchanged'); await writeFile(join(target, name), 'unchanged');
    }
    await writeFile(join(target, 'site.old.js'), 'retained old module');
    await run({ source, target, spec, bytes });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('only a verified module is installed and existing artifacts remain unchanged', () => fixture(async ({ source, target, spec, bytes }) => {
  await copyVerifiedEditorModule(source, target, spec);
  assert.deepEqual(await readFile(join(target, spec.module)), bytes);
  assert.equal((await readdir(target)).some(name => name.startsWith('.editor-module-')), false);
  assert.equal(await readFile(join(target, 'site.old.js'), 'utf8'), 'retained old module');
  for (const name of spec.unchanged) assert.equal(await readFile(join(target, name), 'utf8'), 'unchanged');
}));

test('a different module digest is refused before publishing output', () => fixture(async ({ source, target, spec }) => {
  await writeFile(join(source, spec.module), 'unexpected compiled module');
  await assert.rejects(copyVerifiedEditorModule(source, target, spec), /digest/);
  await assert.rejects(readFile(join(target, spec.module)), { code: 'ENOENT' });
}));

test('an unrelated stylesheet or schema change is refused', () => fixture(async ({ source, target, spec }) => {
  await writeFile(join(source, 'site.css'), 'unexpected style change');
  await assert.rejects(copyVerifiedEditorModule(source, target, spec), /site.css/);
  await assert.rejects(readFile(join(target, spec.module)), { code: 'ENOENT' });
}));

test('artifact names cannot escape the configured output directory', () => fixture(async ({ source, target, spec }) => {
  await assert.rejects(copyVerifiedEditorModule(source, target, { ...spec, module: '../escape.js' }), /module name/);
}));


test('a failed final rename retains existing artifacts and removes its temporary directory', () => fixture(async ({ source, target, spec }) => {
  await mkdir(join(target, spec.module));
  const before = (await readdir(target)).sort();
  await assert.rejects(copyVerifiedEditorModule(source, target, spec));
  assert.deepEqual((await readdir(target)).sort(), before);
  assert.equal(await readFile(join(target, 'site.old.js'), 'utf8'), 'retained old module');
  for (const name of spec.unchanged) assert.equal(await readFile(join(target, name), 'utf8'), 'unchanged');
}));
