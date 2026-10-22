import React from 'react';
import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import config from '../../src/puck.config';
import BulkaPage from './BulkaPage';
import { createSeedPage, locales } from './seed';
import { navigationForContent, type Locale } from './content-model';
import { SiteRuntimeContext } from './SiteRuntimeContext';
import { LanguageContext } from '../context/LanguageContext';
import type { BulkaPageData, LocalizedPages } from './types';

vi.mock('../../src/generated/public-environment', () => ({ publicEnvironment: {
  publicBaseUrl: 'https://bulka-preview.example', siteUrl: 'https://bulka.rs', baseUrl: '/',
  enableGame: true, enableAnalytics: false, enableDonations: false, donationUrl: '',
} }));

const attr = (tag: string, key: string) => tag.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`))?.[1];
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Compare public semantics without coupling the assertion to renderer wrapper
 * nodes or dumping a complete page of HTML on failure. */
function semantics(html: string) {
  return {
    sections: [...html.matchAll(/<section\b[^>]*>/g)].map(([tag]) => ({
      kind: attr(tag, 'data-section-kind'), id: attr(tag, 'id'), labelledBy: attr(tag, 'aria-labelledby'),
    })).filter(section => section.kind),
    headings: [...html.matchAll(/<h[123]\b[^>]*>(.*?)<\/h[123]>/gs)].map(([, value]) => text(value)),
    images: [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({ src: attr(tag, 'src'), alt: attr(tag, 'alt') })),
    links: [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => attr(tag, 'href')),
    buttons: [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => ({
      label: attr(tag, 'aria-label'), controls: attr(tag, 'aria-controls'), expanded: attr(tag, 'aria-expanded'),
    })),
    textHash: createHash('sha256').update(text(html)).digest('hex'),
  };
}

function renderPair(locale: Locale, data: BulkaPageData) {
  const pages: LocalizedPages = { [locale]: data };
  const actual = renderToStaticMarkup(<BulkaPage pages={pages} initialLanguage={locale} autoDetect={false} />);
  const reference = renderToStaticMarkup(<SiteRuntimeContext.Provider value={true}>
    <LanguageContext.Provider value={{ language: locale, setLanguage: () => {}, availableLanguages: [locale] }}>
      <Render config={config} data={data} />
    </LanguageContext.Provider>
  </SiteRuntimeContext.Provider>);
  return { actual, reference };
}

describe('public rendering preserves the shared CMS block semantics', () => {
  for (const locale of locales) {
    test(`${locale}: preserves all text, images, links, controls, block order and enabled Game`, () => {
      const data: BulkaPageData = createSeedPage(locale).content.puckData;
      data.root.props.navigation = navigationForContent(data.content);
      const before = JSON.stringify(data);
      const { actual, reference } = renderPair(locale, data);
      expect(semantics(actual)).toEqual(semantics(reference));
      const sections = semantics(actual).sections.map(section => section.kind);
      expect(sections).toEqual(['hero', 'appearance', 'habits', 'skills', 'health', 'conditions', 'faq', 'game', 'contact', 'gallery']);
      expect(JSON.stringify(data)).toBe(before);
    });
  }

  test('edited fields, reordered sections, repeated block types and removed optional Game stay intact', () => {
    const data: BulkaPageData = createSeedPage('en').content.puckData;
    const hero = data.content.find(block => block.type === 'Hero')!;
    hero.props.id = 'authored-hero';
    hero.props.copy!.hero__title = 'Edited <Bulka> & friends';
    hero.props.copy!.hero__story = '';
    hero.props.photos!.ps_portrait = { src: '/assets/edited-portrait.webp', alt: 'Edited portrait', caption: 'An authored caption' };
    const repeated = structuredClone(data.content.find(block => block.type === 'Appearance')!);
    repeated.props.id = 'second-appearance';
    repeated.props.copy!.appearance__title = 'Another authored section';
    data.content = [...data.content.filter(block => block.type !== 'Game').reverse(), repeated];
    data.root.props.navigation = navigationForContent(data.content);
    const before = JSON.stringify(data);
    const { actual, reference } = renderPair('en', data);
    expect(semantics(actual)).toEqual(semantics(reference));
    expect(actual.includes('Edited &lt;Bulka&gt; &amp; friends')).toBe(true);
    expect(actual.includes('/assets/edited-portrait.webp')).toBe(true);
    expect(actual.includes('id="second-appearance"')).toBe(true);
    expect(actual.includes('data-section-kind="game"')).toBe(false);
    expect(JSON.stringify(data)).toBe(before);
  });
});
