import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import config from '../../src/puck.config';
import { createSeedPage } from './seed';
import { SiteRuntimeContext } from './SiteRuntimeContext';

function markup(interactive: boolean) {
  return renderToStaticMarkup(<SiteRuntimeContext.Provider value={interactive}>
    <Render config={config} data={createSeedPage('ru').content.puckData} />
  </SiteRuntimeContext.Provider>);
}

describe('shared Puck rendering ownership', () => {
  test('editor canvas keeps content visible while navigation and photo interactions are inert', () => {
    const html = markup(false);
    const expectedTitle = createSeedPage('ru').content.puckData.content
      .find(block => block.type === 'Hero')!.props.copy!.hero__title;
    const heading = html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1];
    expect(heading).toBe(expectedTitle);
    const heroButton = html.match(/<button\b[^>]*\bid="hero-cta"[^>]*>/)?.[0];
    expect(heroButton).toBeDefined();
    expect(heroButton).toContain('disabled=""');
    expect(html.includes('inert=""'), 'editor shell navigation is inert').toBe(true);
    expect(/<a\b[^>]*\bhref=/.test(html), 'editor canvas has no navigable links').toBe(false);
    const photoButtons = [...html.matchAll(/<button\b[^>]*data-gallery-image[^>]*>/g)];
    expect(photoButtons.length).toBeGreaterThan(0);
    for (const [button] of photoButtons) expect(button).toContain('disabled=""');
  });

  test('published site keeps hero CTA and original contact destinations active', () => {
    const html = markup(true);
    const heroButton = html.match(/<button\b[^>]*\bid="hero-cta"[^>]*>/)?.[0];
    expect(heroButton).toBeDefined();
    expect(heroButton).not.toContain('disabled=');
    expect(html.includes('href="https://t.me/'), 'Telegram destination').toBe(true);
    expect(html.includes('href="https://wa.me/'), 'WhatsApp destination').toBe(true);
    expect(html.includes('href="https://mextner.com"'), 'original footer destination').toBe(true);
  });
});
