import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import config from '../../src/puck.config';
import { loadSitePages } from '../../src/lib/pages';
import { setPageRecords } from '../../tests/fixtures/astro-content';
import BulkaPage from './BulkaPage';
import { createSeedPage } from './seed';
import { validatePuckPage } from './content-model';

vi.mock('../../src/generated/public-environment', () => ({ publicEnvironment: {
  publicBaseUrl: 'https://bulka-preview.example', siteUrl: 'https://bulka.rs', baseUrl: '/',
  enableGame: false, enableAnalytics: false, enableDonations: false, donationUrl: '',
} }));

const retainedSource = '/assets/retained-source-only.webp';
const clearedCaption = 'This cleared gallery card must disappear';

function clearedPage(blank: string) {
  const data = createSeedPage('en').content.puckData;
  function clear(value: unknown) {
    if (!value || typeof value !== 'object') return;
    // Ordinary object-field editing changes src but keeps alt/caption/thumbSrc.
    if ('src' in value) value.src = blank;
    for (const child of Object.values(value)) clear(child);
  }
  clear(data.content);
  const gallery = data.content.find(block => block.type === 'PhotoGallery')!;
  gallery.props.photosList![0].caption = clearedCaption;
  gallery.props.photosList!.push({ src: retainedSource });
  return data;
}

function recordFor(data: ReturnType<typeof clearedPage>) {
  return { id: 'cleared-photos/en', data: {
    id: 'cleared-photos', locale: 'en', pathname: '/cleared-photos',
    title: 'Photos can be removed', description: 'An authored page without optional photos.',
    puckData: data,
  } };
}

beforeEach(() => setPageRecords([]));

describe('cleared optional CMS photo sources', () => {
  for (const [label, blank] of [['empty', ''], ['whitespace', ' \t\n ']] as const) {
    test(`${label}: publication accepts the cleared value without normalizing saved content`, async () => {
      const record = recordFor(clearedPage(blank));
      const before = structuredClone(record);
      expect(validatePuckPage(record.data.puckData)).toEqual([]);
      setPageRecords([record]);
      const [route] = await loadSitePages();
      expect(route.path).toBe('/en/cleared-photos/');
      expect(route.pages.en!.content).toEqual(record.data.puckData.content);
      expect(record).toEqual(before);
    });

    for (const mode of ['public', 'editor'] as const) {
      test(`${mode}/${label}: clearing seeded photos hides images and cards instead of restoring their sources or thumbnails`, () => {
        const data = clearedPage(blank);
        const before = structuredClone(data);
        const html = renderToStaticMarkup(mode === 'public'
          ? <BulkaPage pages={{ en: data }} initialLanguage="en" autoDetect={false} />
          : <Render config={config} data={data} />);
        const tags = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
        const sources = tags.map(tag => tag.match(/\ssrc="([^"]*)"/)?.[1]);
        expect(sources, 'only the explicitly retained source-only photo is rendered').toEqual([retainedSource]);
        expect(tags.every(tag => /\salt=""(?:\s|\/?>)/.test(tag)), 'source-only retained photo has an explicit decorative alt').toBe(true);
        expect(html.includes(clearedCaption), 'no caption-only polaroid remains for a cleared image').toBe(false);
        expect(data, 'display filtering never deletes or rewrites authored entries').toEqual(before);
      });
    }
  }

  test('non-string and nonempty unsafe sources still prevent publication', async () => {
    for (const src of [undefined, null, 42, 'javascript:alert(1)', 'data:image/svg+xml,evil', '//evil.example/photo.webp']) {
      const record = recordFor(clearedPage(''));
      const hero = record.data.puckData.content.find(block => block.type === 'Hero')!;
      Object.assign(hero.props.photos!.ps_portrait, { src });
      const before = structuredClone(record);
      expect(validatePuckPage(record.data.puckData).some(error => /image URL/.test(error)), `invalid source ${String(src)}`).toBe(true);
      setPageRecords([record]);
      await expect(loadSitePages()).rejects.toThrow(/image URL/);
      expect(record).toEqual(before);
    }
  });
});
