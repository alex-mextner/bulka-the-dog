import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FAQ from '../components/FAQ';
import { LanguageContext } from '../context/LanguageContext';
import { SiteRuntimeContext } from './SiteRuntimeContext';

const items = [
  { id: 'new', question: '', answer: '' },
  { id: 'unfinished', question: 'A draft question?', answer: '' },
  { id: 'complete', question: 'How can I meet Bulka?', answer: 'Contact Lena.' },
];

function markup(interactive: boolean) {
  return renderToStaticMarkup(<SiteRuntimeContext.Provider value={interactive}>
    <LanguageContext.Provider value={{ language: 'en', setLanguage: () => {}, availableLanguages: ['en'] }}>
      <FAQ items={items} />
    </LanguageContext.Provider>
  </SiteRuntimeContext.Provider>);
}

describe('new FAQ items are valid drafts without empty public controls', () => {
  test('the public renderer exposes only complete questions without changing saved content', () => {
    const before = JSON.stringify(items);
    const html = markup(true);
    expect((html.match(/<button\b/g) || []).length).toBe(1);
    expect(html.includes('How can I meet Bulka?')).toBe(true);
    expect(html.includes('A draft question?')).toBe(false);
    expect(JSON.stringify(items)).toBe(before);
  });

  test('the editor retains unfinished items for the author', () => {
    const html = markup(false);
    expect((html.match(/<button\b/g) || []).length).toBe(items.length);
    expect(html.includes('A draft question?')).toBe(true);
  });
});
