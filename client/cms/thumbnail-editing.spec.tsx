import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import config from '../../src/puck.config';
import BulkaPage from './BulkaPage';
import { createSeedPage } from './seed';
import { validatePuckPage } from './content-model';
import type { BulkaPageData } from './types';

const previewOrigin = 'https://bulka-preview.example';
vi.mock('../../src/generated/public-environment', () => ({ publicEnvironment: {
  publicBaseUrl: 'https://bulka-preview.example', siteUrl: 'https://bulka.rs', baseUrl: '/',
  enableGame: false, enableAnalytics: false, enableDonations: false, donationUrl: '',
} }));

function seededPhotos() {
  const data: BulkaPageData = createSeedPage('en').content.puckData;
  data.content = data.content.filter(block => block.type === 'Hero' || block.type === 'PhotoGallery');
  const hero = data.content.find(block => block.type === 'Hero')!.props.photos!.ps_portrait;
  const gallery = data.content.find(block => block.type === 'PhotoGallery')!.props.photosList![0];
  return { data, hero, gallery };
}

function images(mode: 'public' | 'editor', data: BulkaPageData) {
  const html = renderToStaticMarkup(mode === 'public'
    ? <BulkaPage pages={{ en: data }} initialLanguage="en" autoDetect={false} />
    : <Render config={config} data={data} />);
  return [...html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"[^>]*>/g)].map(([, src]) => src);
}

describe('editing existing seeded photo sources keeps thumbnails in sync', () => {
  for (const mode of ['public', 'editor'] as const) {
    test(`${mode}: changing only src displays the new Hero and gallery photos`, () => {
      const { data, hero, gallery } = seededPhotos();
      const oldThumb = hero.thumbSrc!;
      hero.src = '/assets/edited-hero.webp';
      gallery.src = '/assets/edited-gallery.webp';
      const before = JSON.stringify(data);
      expect(validatePuckPage(data)).toEqual([]);
      const rendered = images(mode, data);
      expect(rendered.includes(hero.src), 'Hero must display the edited source').toBe(true);
      expect(rendered.includes(gallery.src), 'gallery must display the edited source').toBe(true);
      expect(rendered.includes(oldThumb) || rendered.includes(new URL(oldThumb, previewOrigin).href), 'the old seed thumbnail must not mask either edit').toBe(false);
      expect(JSON.stringify(data), 'thumbnail selection does not rewrite saved props').toBe(before);
    });

    test(`${mode}: matching seed thumbnails and explicit custom thumbnails remain effective`, () => {
      const { data, hero, gallery } = seededPhotos();
      const originalThumb = hero.thumbSrc!;
      const initial = images(mode, data);
      expect(initial.includes(mode === 'editor' ? new URL(originalThumb, previewOrigin).href : originalThumb)).toBe(true);

      hero.src = '/assets/edited-hero.webp';
      hero.thumbSrc = '/assets/edited-hero-thumb.webp';
      gallery.src = 'https://media.example/current-photo.webp';
      // A custom host may legitimately use the same path as a migration thumb.
      gallery.thumbSrc = new URL(originalThumb, 'https://media.example').href;
      const before = JSON.stringify(data);
      const rendered = images(mode, data);
      expect(rendered.includes(hero.thumbSrc)).toBe(true);
      expect(rendered.includes(gallery.thumbSrc)).toBe(true);
      expect(JSON.stringify(data)).toBe(before);
    });
  }
});
