import { getCollection } from 'astro:content';
import { isContentPublished } from '@conloca/content-api';
import { normalizeLocale, validatePuckPage, navigationForContent, type Locale } from '../../client/cms/content-model';
import type { LocalizedPages } from '../../client/cms/types';
import { blockNames } from '../../client/cms/seed';

export function localizedPath(pathname: string, locale: Locale) {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  return '/' + [locale === 'ru' ? '' : locale, path].filter(Boolean).join('/') + (path || locale !== 'ru' ? '/' : '');
}

/** Always read the published content collection, including CMS commits.
 * The seed script is never invoked during a build. */
export async function loadSitePages() {
  const entries = await getCollection('pages');
  const groups = new Map<string, {
    pages: LocalizedPages;
    alternatives: { language: Locale; href: string }[];
  }>();
  const routes: { id: string; pathname: string; locale: Locale; path: string }[] = [];
  const pathOwners = new Map<string, string>();
  for (const entry of entries) {
    const record = entry.data as any;
    if (!isContentPublished(record)) continue;
    const pathname = record.pathname;
    // An absent address is not a homepage. The loader represents index as '/'.
    if (typeof pathname !== 'string' || !pathname.trim()) continue;
    const id = record.id;
    if (typeof id !== 'string' || !id.trim()) throw new Error(`${entry.id}: content id is required.`);
    // Browser locale fallback must not turn unsupported authored locales into
    // Russian output or silently replace another document's translation.
    const localeCode = typeof record.locale === 'string' ? record.locale.toLowerCase().split(/[-_]/)[0] : '';
    if (!['ru', 'rs', 'sr', 'en'].includes(localeCode)) {
      throw new Error(`${entry.id}: unsupported build locale "${String(record.locale)}". Expected ru, rs/sr or en.`);
    }
    const locale = normalizeLocale(record.locale);
    const group = groups.get(id) || { pages: {}, alternatives: [] };
    if (group.pages[locale]) throw new Error(`${entry.id}: duplicate locale "${locale}" for content "${id}".`);
    const path = localizedPath(pathname, locale);
    if (pathOwners.has(path)) {
      throw new Error(`${entry.id}: duplicate output path "${path}", already used by ${pathOwners.get(path)}.`);
    }
    const data = structuredClone(record.puckData);
    const problems = validatePuckPage(data);
    for (const block of data?.content || []) {
      if (!blockNames.includes(block.type)) problems.push(`Unknown component: ${block.type}`);
    }
    if (problems.length) throw new Error(`${entry.id}: ${problems.join('; ')}`);
    data.root ||= { props: {} };
    data.root.props = {
      ...data.root.props,
      locale,
      navigation: navigationForContent(data.content),
      // Standard Conloca page settings are authoritative for SEO metadata.
      title: record.title || data.root.props?.title || 'Bulka',
      description: record.description ?? data.root.props?.description ?? '',
    };
    // Manifest identity links translations; their slugs may be different.
    group.pages[locale] = data;
    group.alternatives.push({ language: locale, href: path });
    groups.set(id, group);
    pathOwners.set(path, entry.id);
    routes.push({ id, pathname, locale, path });
  }
  return routes.map(({ id, ...route }) => ({ ...route, ...groups.get(id)! }));
}
