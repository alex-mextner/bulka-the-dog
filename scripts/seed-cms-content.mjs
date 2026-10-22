import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSeedPage, locales } from '../client/cms/seed.ts';

const root = new URL('../content/', import.meta.url);
const directory = new URL('default/pages/', root);
await mkdir(directory, { recursive: true });
const force = process.argv.includes('--force');
for (const locale of locales) {
  const file = new URL(`index.${locale}.vxjson`, directory);
  const exists = await access(file).then(() => true, () => false);
  if (exists && !force) {
    console.log(`Preserved existing CMS content: ${fileURLToPath(file)}`);
    continue;
  }
  await writeFile(file, JSON.stringify(createSeedPage(locale), null, 2) + '\n');
  console.log(`Seeded ${fileURLToPath(file)}`);
}
const sites = new URL('sites.json', root);
const sitesExist = await access(sites).then(() => true, () => false);
if (!sitesExist) await writeFile(sites, JSON.stringify({
  sites: { default: { locales, defaultLocale: 'ru' } },
  globalLocales: locales,
}, null, 2) + '\n');
