import schema from './section-schema.json' with { type: 'json' };

export type Locale = 'ru' | 'rs' | 'en';

export function sectionAnchor(kind: string, id?: string): string {
  return !id || id === `bulka-${kind}` ? kind : id;
}

export function navigationForContent(blocks: any[]): { id: string; key: string }[] {
  return blocks.flatMap(block => {
    const kind = (schema[block.type] as any)?.kind;
    return kind && !['hero', 'game'].includes(kind)
      ? [{ id: sectionAnchor(kind, block.props?.id), key: `nav.${kind}` }] : [];
  });
}

export function normalizeLocale(value: unknown): Locale {
  const code = String(value ?? '').toLowerCase().split(/[-_]/)[0];
  return code === 'sr' || code === 'rs' ? 'rs' : code === 'en' ? 'en' : 'ru';
}

export function htmlLanguage(value: unknown): 'ru' | 'sr' | 'en' {
  const locale = normalizeLocale(value);
  return locale === 'rs' ? 'sr' : locale;
}

function lookup(object: unknown, key: string): unknown {
  return key.split('.').reduce((value: any, part) => {
    if (part === '__proto__' || part === 'prototype' || part === 'constructor') return undefined;
    return value && typeof value === 'object' && Object.hasOwn(value, part) ? value[part] : undefined;
  }, object);
}

export function localizeLookup(dictionary: unknown, key: string, fallback: unknown = {}): string {
  const value = lookup(dictionary, key);
  if (typeof value === 'string') return value;
  const defaultValue = lookup(fallback, key);
  return typeof defaultValue === 'string' ? defaultValue : key;
}

export function safePublicUrl(value: unknown, options: { allowContact?: boolean } = {}): boolean {
  if (typeof value !== 'string' || !value || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ||
      Boolean(options.allowContact && ['tel:', 'mailto:'].includes(url.protocol));
  } catch { return false; }
}

/** An optional photo can be cleared in Puck without deleting its object. */
export function hasPhotoSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const migrationPhotoByThumbnail = new Map<string, string>();
function collectMigrationThumbnails(value: unknown) {
  if (!value || typeof value !== 'object') return;
  if ('src' in value && 'thumbSrc' in value && typeof value.src === 'string' && typeof value.thumbSrc === 'string') {
    migrationPhotoByThumbnail.set(value.thumbSrc, value.src);
  }
  for (const child of Object.values(value)) collectMigrationThumbnails(child);
}
collectMigrationThumbnails(schema);

/** A migrated thumbnail is valid only for its original full-size photo. CMS
 * source-only edits can leave that old field behind. Custom thumbnail pairs
 * remain explicit author choices; selecting an image never rewrites content.
 */
export function selectPhotoThumbnail(src: string, thumbSrc: string | undefined, publicOrigin: string): string | undefined {
  if (!thumbSrc) return undefined;
  try {
    const origin = new URL(publicOrigin);
    const thumbnail = new URL(thumbSrc, origin);
    if (thumbnail.origin !== origin.origin) return thumbSrc;
    const original = migrationPhotoByThumbnail.get(thumbnail.pathname + thumbnail.search + thumbnail.hash);
    if (original && new URL(src, origin).href !== new URL(original, origin).href) return undefined;
  } catch { /* Unknown URL correspondence: preserve the explicit thumbnail. */ }
  return thumbSrc;
}

/** Root-relative public photos belong to this build, even in a hosted editor.
 * Conloca owns /assets/ draft-media URLs and transforms them before rendering.
 * The saved page always keeps its portable, relative asset paths.
 */
export function resolveCmsAssetUrl(value: string, publicOrigin: string, interactive: boolean): string {
  if (interactive || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/assets/')) return value;
  try {
    const origin = new URL(publicOrigin);
    return ['https:', 'http:'].includes(origin.protocol) ? new URL(value, origin).href : value;
  } catch { return value; }
}

export function resolveSectionAssets<T>(value: T, publicOrigin: string, interactive: boolean): T {
  if (interactive) return value;
  function visit(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key,
      ['src', 'thumbSrc'].includes(key) && typeof entry === 'string'
        ? resolveCmsAssetUrl(entry, publicOrigin, false) : visit(entry),
    ]));
  }
  return visit(value) as T;
}

export function pageForLocale<T>(pages: Partial<Record<Locale, T>>, value: unknown): T | undefined {
  return pages[normalizeLocale(value)] ?? pages.ru ?? pages.rs ?? pages.en;
}

export function validatePuckPage(page: any): string[] {
  const errors: string[] = [];
  if (!page || !Array.isArray(page.content)) return ['Page content must be an array.'];
  const ids = new Set<string>();
  function walk(value: any, path: string) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && Object.hasOwn(value, 'src')) {
      if (typeof value.src !== 'string' || (hasPhotoSource(value.src) && !safePublicUrl(value.src))) errors.push(`${path}: image URL must be a local path or HTTP(S) URL.`);
      if (Object.hasOwn(value, 'alt') && typeof value.alt !== 'string') errors.push(`${path}: image alt must be a string (empty for decorative images).`);
    }
    for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
  }
  page.content.forEach((block: any, index: number) => {
    const path = `content[${index}]`;
    if (!block || typeof block.type !== 'string' || !block.type) errors.push(`${path}: block type is required.`);
    const id = block?.props?.id;
    if (typeof id !== 'string' || !id) errors.push(`${path}: block id is required.`);
    else if (ids.has(id)) errors.push(`${path}: duplicate block id "${id}".`);
    else ids.add(id);
    if (['FAQ', 'Questions'].includes(block?.type) && Array.isArray(block.props?.items)) {
      block.props.items.forEach((item: any, i: number) => {
        if (typeof item?.question !== 'string' || typeof item?.answer !== 'string') errors.push(`${path}.items[${i}]: question and answer must be strings.`);
      });
    }
    walk(block?.props, `${path}.props`);
  });
  return errors;
}
