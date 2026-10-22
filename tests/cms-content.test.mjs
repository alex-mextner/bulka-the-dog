import test from 'node:test';
import assert from 'node:assert/strict';
import * as definitions from '../src/puck.definitions.ts';
import {
  normalizeLocale, htmlLanguage, localizeLookup, safePublicUrl,
  pageForLocale, validatePuckPage, sectionAnchor, navigationForContent,
  resolveCmsAssetUrl, resolveSectionAssets,
} from '../client/cms/content-model.ts';

test('Serbian browser and CMS locale aliases resolve consistently', () => {
  for (const value of ['rs', 'sr', 'sr-RS']) assert.equal(normalizeLocale(value), 'rs');
  assert.equal(htmlLanguage('rs'), 'sr');
  assert.equal(normalizeLocale('en-GB'), 'en');
  assert.equal(normalizeLocale('ru-RU'), 'ru');
  assert.equal(normalizeLocale('de-DE'), 'ru');
});

test('content lookup keeps intentional empty values and falls back only for missing keys', () => {
  const selected = { hero: { title: 'I am Bulka', story: '' } };
  const fallback = { hero: { title: 'Я Булка', story: 'История', intro: 'Привет' } };
  assert.equal(localizeLookup(selected, 'hero.title', fallback), 'I am Bulka');
  assert.equal(localizeLookup(selected, 'hero.story', fallback), '');
  assert.equal(localizeLookup(selected, 'hero.intro', fallback), 'Привет');
  assert.equal(localizeLookup(selected, 'unknown', fallback), 'unknown');
});

test('editable URLs reject executable and cross-origin scheme-relative values', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,evil', '//evil.example/a', '\\evil.example', '/\\evil.example']) {
    assert.equal(safePublicUrl(value), false, value);
  }
  for (const value of ['/images/photo.webp', 'https://example.org/photo.jpg', 'http://localhost:4321/a']) {
    assert.equal(safePublicUrl(value), true, value);
  }
  assert.equal(safePublicUrl('tel:+381600000000'), false);
  assert.equal(safePublicUrl('tel:+381600000000', { allowContact: true }), true);
  assert.equal(safePublicUrl('mailto:hello@example.org', { allowContact: true }), true);
});

test('locale selection preserves independent pages and does not mutate input', () => {
  const pages = { ru: { content: [{ type: 'Hero', props: { id: 'ru-hero', title: 'Я Булка' } }] }, en: { content: [] } };
  const before = JSON.stringify(pages);
  assert.equal(pageForLocale(pages, 'en-US'), pages.en);
  assert.equal(pageForLocale(pages, 'sr-RS'), pages.ru);
  assert.equal(JSON.stringify(pages), before);
});

test('a new English-only CMS page stays visible when another locale is requested', () => {
  const english = { content: [{ type: 'Hero', props: { id: 'only-en', title: 'I am Bulka' } }] };
  const pages = { en: english };
  assert.equal(pageForLocale(pages, 'ru'), english);
  assert.equal(pageForLocale(pages, 'rs'), english);
  assert.equal(pageForLocale(pages, 'en'), english);
});

test('duplicate section types have distinct anchors and only present sections enter navigation', () => {
  assert.equal(sectionAnchor('habits', 'bulka-habits'), 'habits');
  assert.equal(sectionAnchor('habits', 'Habits-second'), 'Habits-second');
  assert.deepEqual(navigationForContent([
    { type: 'Hero', props: { id: 'bulka-hero' } },
    { type: 'Habits', props: { id: 'bulka-habits' } },
    { type: 'Habits', props: { id: 'Habits-second' } },
  ]), [{ id: 'habits', key: 'nav.habits' }, { id: 'Habits-second', key: 'nav.habits' }]);
});

test('invalid content reports duplicate IDs and unsafe photos before render', () => {
  const page = { content: [
    { type: 'Hero', props: { id: 'same', image: { src: '/images/photo.webp', alt: 'Я на прогулке' } } },
    { type: 'PhotoStrip', props: { id: 'same', photos: [{ src: 'javascript:alert(1)', alt: null }] } },
  ] };
  const before = JSON.stringify(page);
  const errors = validatePuckPage(page);
  assert.ok(errors.some(x => /duplicate/i.test(x)));
  assert.ok(errors.some(x => /url/i.test(x)));
  assert.ok(errors.some(x => /alt/i.test(x)));
  assert.equal(JSON.stringify(page), before);
});

test('a valid editable FAQ and image page passes validation', () => {
  assert.deepEqual(validatePuckPage({ content: [
    { type: 'Hero', props: { id: 'hero', image: { src: '/images/hero.webp', alt: 'Я Булка' } } },
    { type: 'FAQ', props: { id: 'faq', items: [{ question: 'Как познакомиться?', answer: 'Напиши Лене.' }] } },
  ] }), []);
  assert.ok(validatePuckPage({ content: 'bad' }).length > 0);
});

test('hosted editor photos use the build origin while draft media and public-site URLs stay intact', () => {
  const origin = 'https://bulka-preview.example';
  assert.equal(resolveCmsAssetUrl('/images/hero.webp', origin, false), `${origin}/images/hero.webp`);
  assert.equal(resolveCmsAssetUrl('/placeholder.svg', origin, false), `${origin}/placeholder.svg`);
  assert.equal(resolveCmsAssetUrl('/images/hero.webp', origin, true), '/images/hero.webp');
  assert.equal(resolveCmsAssetUrl('/assets/new-upload.webp', origin, false), '/assets/new-upload.webp');
  assert.equal(resolveCmsAssetUrl('https://media.example/hero.webp', origin, false), 'https://media.example/hero.webp');
  assert.equal(resolveCmsAssetUrl('//other.example/hero.webp', origin, false), '//other.example/hero.webp');
  assert.equal(resolveCmsAssetUrl('/images/hero.webp', '', false), '/images/hero.webp');
});

test('nested editable photos resolve for the editor without changing stored content or links', () => {
  const source = {
    photos: { hero: { src: '/images/hero.webp', thumbSrc: '/images/thumb.webp', alt: 'Я Булка' } },
    items: [{ photo: { src: '/images/habit.webp', alt: 'Я дома' } }],
    photosList: [{ src: '/assets/upload.webp', alt: 'Моё новое фото' }],
    mapUrl: '/some-page/', copy: { caption: '/images/literal-copy' },
  };
  const before = JSON.stringify(source);
  const rendered = resolveSectionAssets(source, 'https://preview.example', false);
  assert.equal(rendered.photos.hero.src, 'https://preview.example/images/hero.webp');
  assert.equal(rendered.photos.hero.thumbSrc, 'https://preview.example/images/thumb.webp');
  assert.equal(rendered.items[0].photo.src, 'https://preview.example/images/habit.webp');
  assert.equal(rendered.photosList[0].src, '/assets/upload.webp');
  assert.equal(rendered.mapUrl, source.mapUrl);
  assert.equal(rendered.copy.caption, source.copy.caption);
  assert.equal(JSON.stringify(source), before);
  assert.equal(resolveSectionAssets(source, 'https://preview.example', true), source);
});

for (const [name, definition] of Object.entries(definitions)) {
  if (name === 'RootDefinition') continue;
  for (const [fieldName, field] of Object.entries(definition.fields)) {
    if (field.type !== 'array') continue;
    test(`${name}.${fieldName}: normal Add item produces publishable data`, () => {
      const page = { content: [{
        type: name.replace(/Definition$/, ''),
        props: { ...structuredClone(definition.defaultProps), id: `new-${name}`, [fieldName]: [structuredClone(field.defaultItemProps)] },
      }] };
      const before = JSON.stringify(page);
      assert.deepEqual(validatePuckPage(page), []);
      assert.equal(JSON.stringify(page), before);
    });
  }
}

test('explicit empty FAQ strings and decorative image alternatives remain authored content', () => {
  const page = { content: [
    { type: 'Questions', props: { id: 'faq-empty', items: [{ question: '', answer: '' }] } },
    { type: 'PhotoGallery', props: { id: 'decorative', photosList: [{ src: '/placeholder.svg', alt: '', caption: '' }] } },
  ] };
  const before = JSON.stringify(page);
  assert.deepEqual(validatePuckPage(page), []);
  assert.equal(JSON.stringify(page), before);
});

test('missing or non-string item text and unsafe image URLs still fail validation', () => {
  for (const value of [undefined, null, 42]) {
    assert.ok(validatePuckPage({ content: [
      { type: 'Questions', props: { id: 'wrong-type', items: [{ question: value, answer: '' }] } },
    ] }).length > 0);
    assert.ok(validatePuckPage({ content: [
      { type: 'Questions', props: { id: 'wrong-type', items: [{ question: '', answer: value }] } },
    ] }).length > 0);
    assert.ok(validatePuckPage({ content: [
      { type: 'PhotoGallery', props: { id: 'wrong-type', photosList: [{ src: '/placeholder.svg', alt: value }] } },
    ] }).length > 0);
  }
  assert.ok(validatePuckPage({ content: [
    { type: 'PhotoGallery', props: { id: 'unsafe', photosList: [{ src: 'javascript:alert(1)', alt: '' }] } },
  ] }).length > 0);
});
