import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSeedPage, locales, blockNames } from '../client/cms/seed.ts';
import { validatePuckPage } from '../client/cms/content-model.ts';
import { getTranslation } from '../client/lib/translations.ts';

test('all three migration seeds preserve Bulka’s original words and valid editable block data', () => {
  for (const locale of locales) {
    const page = createSeedPage(locale).content.puckData;
    assert.deepEqual(validatePuckPage(page), []);
    assert.equal(page.root.props.locale, locale);
    assert.equal(page.content.find(block => block.type === 'Hero').props.copy.hero__title, getTranslation(locale, 'hero.title'));
    assert.equal(page.content.find(block => block.type === 'Hero').props.copy.hero__story, getTranslation(locale, 'hero.story'));
    assert.equal(page.content.find(block => block.type === 'Conditions').props.copy.conditions__adoption, getTranslation(locale, 'conditions.adoption'));
  }
});

test('homepage translations share one Conloca identity', () => {
  assert.equal(new Set(locales.map(locale => createSeedPage(locale).id)).size, 1);
});

test('migration keeps the 21-photo strip and all 30 lightbox registrations including section photos', () => {
  const blocks = createSeedPage('ru').content.puckData.content;
  const gallery = blocks.find(block => block.type === 'PhotoGallery').props.photosList;
  assert.equal(gallery.length, 21);
  assert.equal(blocks.reduce((sum, block) => sum + Object.keys(block.props.photos || {}).length, 0) + gallery.length, 30);
  assert.equal(gallery[0].src, '/images/photo-set/ps_portrait.webp');
  assert.equal(gallery[0].thumbSrc, '/images/photo-set/thumbs/ps_portrait.webp');
  assert.equal(gallery.at(-1).src, '/images/person_dog.webp');
});

test('contacts retain the original destinations in every language', () => {
  for (const locale of locales) {
    const contact = createSeedPage(locale).content.puckData.content.find(block => block.type === 'Contact').props;
    for (const channel of ['telegram', 'whatsapp', 'instagram', 'phone']) {
      assert.equal(contact.copy[`contact_links__${channel}_url`], getTranslation(locale, `contact_links.${channel}_url`));
    }
    assert.match(contact.mapUrl, /Super\+Vero\+Zira/);
  }
});

test('habits, commands, health notes and FAQ remain real repeatable content', () => {
  const blocks = createSeedPage('en').content.puckData.content;
  assert.equal(blocks.find(block => block.type === 'Habits').props.items.length, 7);
  assert.equal(blocks.find(block => block.type === 'Skills').props.commands.length, 7);
  assert.equal(blocks.find(block => block.type === 'Health').props.healthItems.length, 4);
  const faq = blocks.find(block => block.type === 'Questions').props;
  assert.equal(faq.items.length, 8);
  const roundTrip = JSON.parse(JSON.stringify({ ...faq, items: [...faq.items, { id: 'new-question', question: 'A new question?', answer: 'An edited answer.' }] }));
  assert.equal(roundTrip.items.length, 9);
  assert.equal(roundTrip.items.at(-1).answer, 'An edited answer.');
});

test('checked-in CMS pages are valid independent documents; builds do not regenerate them', async () => {
  const titles = new Set();
  for (const locale of locales) {
    const entry = JSON.parse(await readFile(new URL(`../content/default/pages/index.${locale}.vxjson`, import.meta.url), 'utf8'));
    const page = entry.content.puckData;
    assert.deepEqual(validatePuckPage(page), []);
    assert.equal(page.root.props.locale, locale);
    assert.ok(page.content.every(block => blockNames.includes(block.type)));
    titles.add(page.content.find(block => block.type === 'Hero').props.copy.hero__title);
  }
  assert.equal(titles.size, 3);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.build, 'astro build');
});
