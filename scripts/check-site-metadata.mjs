import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicEnvironment } from '../src/generated/public-environment.ts';

const siteUrl = publicEnvironment.siteUrl;
const siteOrigin = new URL(siteUrl).origin;
const routes = [ ['ru', '/', 'index.html'], ['sr', '/rs/', 'rs/index.html'], ['en', '/en/', 'en/index.html'] ];
const failures = [];
function equal(actual, expected, label) {
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map(([, key, value]) => [key, value]));
}

for (const [language, pathname, file] of routes) {
  const html = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => attributes(tag));
  const meta = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attributes(tag));
  const canonical = new URL(pathname, siteUrl).href;
  equal(links.find(link => link.rel === 'canonical')?.href, canonical, `${language} canonical`);
  equal(meta.find(tag => tag.property === 'og:url')?.content, canonical, `${language} og:url`);
  for (const [alternateLanguage, alternatePath] of routes) {
    equal(links.find(link => link.rel === 'alternate' && link.hreflang === alternateLanguage)?.href,
      new URL(alternatePath, siteUrl).href, `${language} alternate ${alternateLanguage}`);
  }
  for (const field of ['og:image', 'twitter:image']) {
    const value = meta.find(tag => tag.property === field || tag.name === field)?.content;
    equal(value && new URL(value).origin, siteOrigin, `${language} ${field} origin`);
  }
  const structured = JSON.parse(html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1] || '{}');
  equal(structured.mainEntityOfPage?.['@id'], canonical, `${language} JSON-LD URL`);
  equal(structured.inLanguage, language, `${language} JSON-LD language`);
  equal(/<script\b[^>]*src="https:\/\/cloud\.umami\.is\/script\.js"/.test(html),
    publicEnvironment.enableAnalytics, `${language} Umami uses shared analytics flag`);
}
assert.deepEqual(failures, [], 'Built public metadata and analytics must match their configured build settings.');
console.log('Built metadata verified: canonical, alternates, social URLs, JSON-LD and shared analytics flag for RU/SR/EN.');
