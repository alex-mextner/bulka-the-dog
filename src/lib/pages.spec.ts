import { beforeEach, describe, expect, test } from 'vitest';
import { loadSitePages } from './pages';
import { setPageRecords } from '../../tests/fixtures/astro-content';
import { createSeedPage } from '../../client/cms/seed';
import { normalizeLocale } from '../../client/cms/content-model';

function record(id: string, locale: unknown, pathname?: string) {
  return {
    // This is the published astro-cms loader contract: entry IDs distinguish
    // locale versions; data.id identifies their shared document.
    id: `${id}/${locale}`,
    data: {
      id, locale, pathname, title: `${id} ${locale}`, description: `${locale} description`,
      // Keep block data valid when the fixture deliberately supplies an
      // unsupported collection locale; production must reject that locale.
      puckData: createSeedPage(normalizeLocale(locale)).content.puckData,
    },
  };
}

beforeEach(() => setPageRecords([]));

describe('translated CMS route assembly', () => {
  test('one document with different localized slugs shares its languages and exact alternate URLs', async () => {
    const records = [record('about-bulka', 'ru', '/o-bulke'), record('about-bulka', 'en', '/about')];
    const before = JSON.stringify(records);
    setPageRecords(records);
    const routes = await loadSitePages();
    expect(routes.map(route => route.path)).toEqual(['/o-bulke/', '/en/about/']);
    for (const route of routes) {
      expect(Object.keys(route.pages).sort()).toEqual(['en', 'ru']);
      expect(route).toMatchObject({ alternatives: [
        { language: 'ru', href: '/o-bulke/' },
        { language: 'en', href: '/en/about/' },
      ] });
      expect(route.pages.ru!.root.props.title).toBe('about-bulka ru');
      expect(route.pages.en!.root.props.title).toBe('about-bulka en');
      expect(route.pages.en!.root.props.locale).toBe('en');
    }
    expect(JSON.stringify(records), 'route assembly does not mutate authored data').toBe(before);
  });

  test('different document identities do not become translations merely because their slugs match', async () => {
    setPageRecords([record('russian-only', 'ru', '/shared'), record('english-only', 'en', '/shared')]);
    const routes = await loadSitePages();
    expect(routes).toHaveLength(2);
    expect(Object.keys(routes[0].pages)).toEqual(['ru']);
    expect(Object.keys(routes[1].pages)).toEqual(['en']);
    expect(routes[0]).toMatchObject({ alternatives: [{ language: 'ru', href: '/shared/' }] });
    expect(routes[1]).toMatchObject({ alternatives: [{ language: 'en', href: '/en/shared/' }] });
  });

  test('unaddressed content is skipped without creating or overwriting a homepage', async () => {
    setPageRecords([
      record('home', 'ru', '/'),
      record('no-address', 'ru'),
      record('empty-address', 'ru', ''),
      record('blank-address', 'en', '   '),
    ]);
    const routes = await loadSitePages();
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/');
    expect(routes[0].pages.ru!.root.props.title).toBe('home ru');
    expect(routes[0]).toMatchObject({ alternatives: [{ language: 'ru', href: '/' }] });
  });

  test.each([
    ['locale-prefix collision', record('russian-en-slug', 'ru', '/en'), record('english-home', 'en', '/')],
    ['equivalent slashes', record('first', 'ru', '/guide'), record('second', 'ru', '/guide/')],
  ])('rejects a duplicate output URL: %s', async (_name, first, second) => {
    setPageRecords([first, second]);
    await expect(loadSitePages()).rejects.toThrow(/duplicate.*(?:path|url)/i);
  });

  test.each([
    ['rs', 'sr'],
    ['en', 'en-GB'],
  ])('rejects two versions of one document normalized to the same locale: %s / %s', async (first, second) => {
    setPageRecords([record('same-document', first, '/first'), record('same-document', second, '/second')]);
    await expect(loadSitePages()).rejects.toThrow(/duplicate.*locale/i);
  });

  test.each(['de', '', undefined, null])('rejects unsupported or absent build locale %s', async locale => {
    setPageRecords([record('unsupported-locale', locale, '/article')]);
    await expect(loadSitePages()).rejects.toThrow(/unsupported.*locale/i);
  });

  test('recognized Serbian and English aliases keep their explicit build routes', async () => {
    setPageRecords([record('serbian', 'sr-RS', '/clanak'), record('english', 'en-GB', '/article')]);
    const routes = await loadSitePages();
    expect(routes.map(route => [route.locale, route.path])).toEqual([
      ['rs', '/rs/clanak/'], ['en', '/en/article/'],
    ]);
  });
});
