import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import type { Field } from '@puckeditor/core';
import config from '../../src/puck.config';
import { createSeedPage } from './seed';
import { getTranslation } from '../lib/translations';
import type { BulkaPageData } from './types';

const textMarkup = (value: string) => renderToStaticMarkup(<>{value}</>);

describe('CMS insertion follows the page locale without copying migration content', () => {
  for (const locale of ['en', 'rs'] as const) {
    test(`new blocks and root copy use ${locale} fallbacks`, () => {
      const seed = createSeedPage(locale).content.puckData;
      const data: BulkaPageData = {
        root: { props: { ...seed.root.props, ...structuredClone(config.root!.defaultProps), locale } },
        content: (['Hero', 'Habits', 'Questions'] as const).map(type => ({
          type,
          props: { ...structuredClone(config.components[type].defaultProps), id: `inserted-${type}` },
        })),
      };
      const before = JSON.stringify(data);
      const html = renderToStaticMarkup(<Render config={config} data={data} />);
      expect(html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1]).toBe(textMarkup(getTranslation(locale, 'hero.title')));
      for (const key of ['habits.title', 'faq.title', 'nav.appearance']) {
        expect(html.includes(textMarkup(getTranslation(locale, key))), `${locale}: ${key}`).toBe(true);
      }
      expect(html.includes(textMarkup(getTranslation('ru', 'hero.title'))), 'new blocks must not force Russian copy').toBe(false);
      expect(JSON.stringify(data), 'rendering must not mutate saved CMS props').toBe(before);
    });
  }

  test('the editor can set the root language for a new page', () => {
    const fields: Record<string, Field> = config.root!.fields || {};
    const field = fields.locale;
    expect(field, 'new page locale must be editable').toBeDefined();
    expect(field?.type).toBe('select');
    if (field?.type !== 'select') return;
    expect(field.options.map(option => option.value)).toEqual(['ru', 'rs', 'en']);
  });

  test('authored empty text stays empty instead of restoring a translated fallback', () => {
    const seed = createSeedPage('en').content.puckData;
    const data: BulkaPageData = {
      root: seed.root,
      content: [{ type: 'Hero', props: { id: 'empty-hero', copy: { hero__title: '' } } }],
    };
    const html = renderToStaticMarkup(<Render config={config} data={data} />);
    expect(html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1]).toBe('');
  });
});
