import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const directory = new URL('../dist/_conloca/', import.meta.url);
const files = await readdir(directory);
const manifests = files.filter(file => /^component-manifest\.[a-f0-9]+\.json$/.test(file));
assert.equal(manifests.length, 1, 'Expected one component manifest from a clean Astro build.');
const manifest = JSON.parse(await readFile(new URL(manifests[0], directory), 'utf8'));
const expected = ['Hero', 'Appearance', 'Habits', 'Skills', 'Health', 'Conditions', 'Questions', 'Game', 'Contact', 'PhotoGallery'];
assert.deepEqual(Object.keys(manifest.components).sort(), expected.sort(), 'Every editable section must appear in the manifest.');
assert.deepEqual(manifest.unresolved, []);
function assertReadable(value, path = 'manifest') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/unreadable/i.test(key)) assert.ok(!child || (Array.isArray(child) && child.length === 0), `${path}.${key} reports missing vocabulary`);
    assertReadable(child, `${path}.${key}`);
  }
}
assertReadable(manifest);
for (const [name, component] of Object.entries(manifest.components)) {
  assert.equal(component.fields.copy.type, 'object', `${name} text fields`);
  assert.ok(Object.keys(component.fields.copy.objectFields).length > 0, `${name} text vocabulary`);
  assert.ok(component.defaultProps?.copy, `${name} defaults`);
}
assert.equal(manifest.components.Hero.fields.photos.objectFields.ps_portrait.objectFields.src.type, 'text');
assert.equal(manifest.components.Habits.fields.items.type, 'array');
assert.equal(manifest.components.Skills.fields.commands.type, 'array');
assert.equal(manifest.components.Health.fields.healthItems.type, 'array');
assert.equal(manifest.components.Questions.fields.items.type, 'array');
assert.equal(manifest.components.PhotoGallery.fields.photosList.type, 'array');
assert.equal(manifest.root.fields.copy.type, 'object');
assert.equal(manifest.root.fields.locale.type, 'select');
assert.deepEqual(manifest.root.fields.locale.options.map(option => option.value), ['ru', 'rs', 'en']);
const bundles = files.filter(file => /^editor-bundle\..*\.js$/.test(file));
assert.ok(bundles.length > 0, 'Editor bundle must be emitted.');
for (const file of bundles) {
  const source = await readFile(new URL(file, directory), 'utf8');
  assert.equal(/import\.meta\.env\b/.test(source), false, 'The hosted native ESM bundle must not depend on Vite env globals.');
}
console.log(`Conloca artifacts verified: ${expected.length} readable components, nested photo/repeater fields, native ESM env transform.`);
