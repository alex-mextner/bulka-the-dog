import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';

vi.mock('../../src/generated/public-environment', () => ({ publicEnvironment: {
  publicBaseUrl: 'https://bulka-preview.example', siteUrl: 'https://bulka.rs', baseUrl: '/',
  enableGame: true, enableAnalytics: true, enableDonations: false, donationUrl: '',
} }));
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => <i data-review-analytics="analytics" /> }));
vi.mock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => <i data-review-analytics="speed" /> }));

import config from '../../src/puck.config';
import { createSeedPage, blockNames } from './seed';
import { SiteRuntimeContext } from './SiteRuntimeContext';

function markup(interactive: boolean) {
  return renderToStaticMarkup(<SiteRuntimeContext.Provider value={interactive}>
    <Render config={config} data={createSeedPage('ru').content.puckData} />
  </SiteRuntimeContext.Provider>);
}

describe('migration preserves optional features and editor isolation', () => {
  test('every accepted or authored component has a registered renderer', () => {
    const declared = new Set(Object.keys(config.components));
    expect(blockNames.filter(name => !declared.has(name))).toEqual([]);
    for (const locale of ['ru', 'rs', 'en']) {
      const entry = JSON.parse(readFileSync(new URL(`../../content/default/pages/index.${locale}.vxjson`, import.meta.url), 'utf8'));
      const names: string[] = entry.content.puckData.content.map((block: { type: string }) => block.type);
      expect(names.filter(name => !declared.has(name))).toEqual([]);
      expect(names.indexOf('Game'), `${locale}: optional Game follows Questions`).toBe(names.indexOf('Questions') + 1);
      expect(names.indexOf('Contact'), `${locale}: Contact follows optional Game`).toBe(names.indexOf('Game') + 1);
    }
  });

  test('enabled game is actually rendered between FAQ and Contact on the published page', () => {
    const html = markup(true);
    const game = html.indexOf('data-section-kind="game"');
    expect(game, 'the enabled game must produce visible page content').toBeGreaterThan(-1);
    expect(game).toBeGreaterThan(html.indexOf('data-section-kind="faq"'));
    expect(game).toBeLessThan(html.indexOf('data-section-kind="contact"'));
    expect(html.includes('data-review-analytics="analytics"')).toBe(true);
    expect(html.includes('data-review-analytics="speed"')).toBe(true);
  });

  test('hosted editor never mounts external analytics even when public analytics are enabled', () => {
    const html = markup(false);
    expect(html.includes('data-review-analytics=')).toBe(false);
    expect(html.includes('data-section-kind="game"')).toBe(false);
  });
});
