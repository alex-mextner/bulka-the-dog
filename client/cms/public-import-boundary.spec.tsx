import React from 'react';
import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSeedPage } from './seed';

vi.mock('@puckeditor/core', () => { throw new Error('Public page imported the Puck editor runtime'); });
vi.mock('@puckeditor/core/rsc', () => { throw new Error('Public page imported the Puck renderer runtime'); });
vi.mock('../../src/puck.config', () => { throw new Error('Public page imported the editor field config'); });
vi.mock('../../src/generated/public-environment', () => ({ publicEnvironment: {
  publicBaseUrl: 'https://bulka-preview.example', siteUrl: 'https://bulka.rs', baseUrl: '/',
  enableGame: false, enableAnalytics: false, enableDonations: false, donationUrl: '',
} }));

test('the public entry renders without resolving Puck or the editor config', async () => {
  const { default: BulkaPage } = await import('./BulkaPage');
  const data = createSeedPage('en').content.puckData;
  const html = renderToStaticMarkup(<BulkaPage pages={{ en: data }} initialLanguage="en" />);
  expect(html.includes('id="hero-title"')).toBe(true);
  expect(html.includes('data-section-kind="contact"')).toBe(true);
  expect(html.includes('data-section-kind="game"'), 'the disabled optional game remains disabled').toBe(false);
});
