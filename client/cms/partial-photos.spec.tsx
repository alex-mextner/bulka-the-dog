import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import config from '../../src/puck.config';
import { loadSitePages } from '../../src/lib/pages';
import { setPageRecords } from '../../tests/fixtures/astro-content';
import BulkaPage from './BulkaPage';
import { createSeedPage } from './seed';

vi.mock('../../src/generated/public-environment', () => ({ publicEnvironment: {
  publicBaseUrl: 'https://bulka-preview.example', siteUrl: 'https://bulka.rs', baseUrl: '/',
  enableGame: false, enableAnalytics: false, enableDonations: false, donationUrl: '',
} }));

const sources = [
  '/assets/new-portrait.webp', '/assets/new-habit.webp',
  '/assets/second-habit.webp', '/assets/new-gallery.webp',
];

function partialPhotoRecord() {
  return {
    id: 'partial-photos/en',
    data: {
      id: 'partial-photos', locale: 'en', pathname: '/partial-photos',
      title: 'My new photos', description: 'My new page',
      puckData: {
        root: createSeedPage('en').content.puckData.root,
        content: [
          { type: 'Hero', props: {
            ...structuredClone(config.components.Hero.defaultProps), id: 'new-hero',
            // Puck object fields can create this shape when only src is edited.
            photos: { ps_portrait: { src: sources[0] } },
          } },
          { type: 'Habits', props: {
            ...structuredClone(config.components.Habits.defaultProps), id: 'new-habits',
            items: [{ id: 'new-habit', title: 'I explore', body: 'I follow my nose.', showPhotos: true,
              photo: { src: sources[1] }, secondaryPhoto: { src: sources[2] },
            }],
          } },
          { type: 'PhotoGallery', props: {
            ...structuredClone(config.components.PhotoGallery.defaultProps), id: 'new-gallery',
            photosList: [{ src: sources[3] }],
          } },
        ],
      },
    },
  };
}

beforeEach(() => setPageRecords([]));

describe('partial CMS photo objects remain publishable and accessible', () => {
  test.each(['public', 'editor'] as const)('%s rendering supplies a neutral alt without changing saved photos', async mode => {
    const record = partialPhotoRecord();
    const before = JSON.stringify(record);
    setPageRecords([record]);
    const [route] = await loadSitePages();
    expect(route.path).toBe('/en/partial-photos/');
    const data = route.pages.en!;
    const html = renderToStaticMarkup(mode === 'public'
      ? <BulkaPage pages={route.pages} initialLanguage="en" autoDetect={false} />
      : <Render config={config} data={data} />);
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
    for (const src of sources) {
      const matching = images.filter(tag => tag.includes(`src="${src}"`));
      expect(matching.length, `${mode}: ${src} is rendered`).toBeGreaterThan(0);
      expect(matching.every(tag => /\salt=""(?:\s|\/?>)/.test(tag)), `${mode}: ${src} has an explicit empty alt`).toBe(true);
    }
    expect(JSON.stringify(record), 'publication and rendering preserve authored partial objects').toBe(before);
    expect(JSON.stringify(data.content), 'only root metadata is enriched during route assembly').toBe(JSON.stringify(record.data.puckData.content));
  });

  test('an explicit non-string alternative or unsafe partial image URL still prevents publication', async () => {
    for (const patch of [{ alt: null }, { alt: 42 }, { src: 'javascript:alert(1)' }]) {
      const record = partialPhotoRecord();
      const hero = record.data.puckData.content[0];
      Object.assign(hero.props.photos!.ps_portrait, patch);
      setPageRecords([record]);
      await expect(loadSitePages()).rejects.toThrow(/image (alt|URL)/);
    }
  });
});
