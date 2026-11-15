import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Publish only the expected module; never replace the site's styles, schema or older cached modules. */
export async function copyVerifiedEditorModule(source, target, spec) {
  assert.match(spec.module, /^site\.[a-f0-9]{16}\.js$/, 'Invalid editor module name');
  assert.match(spec.sha256, /^[a-f0-9]{64}$/, 'Invalid editor module digest');
  assert.equal(spec.module, `site.${spec.sha256.slice(0, 16)}.js`, 'Module name and digest disagree');
  const bytes = await readFile(join(source, spec.module));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256, 'Editor module digest changed');
  for (const name of spec.unchanged) {
    assert.match(name, /^[a-z0-9][a-z0-9.-]*$/, 'Invalid companion artifact name');
    assert.deepEqual(await readFile(join(source, name)), await readFile(join(target, name)), `${name} changed`);
  }
  const staging = await mkdtemp(join(target, '.editor-module-'));
  try {
    const file = join(staging, spec.module);
    await writeFile(file, bytes);
    await rename(file, join(target, spec.module));
  } finally { await rm(staging, { recursive: true, force: true }); }
}
