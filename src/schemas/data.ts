import { defineHostSchema } from '@conloca/astro-cms/page-schemas';
import typia, { type tags } from 'typia';

/**
 * Data collection schemas for the CMS.
 *
 * Each key is a collection name (matching folders in content/data/). Each value
 * is a TypeScript type plus what Typia generates for it at build time (wired by
 * typia-vite.mjs in astro.config.mjs): `validate` checks every stored entry
 * when the collection loads, and `metadata` is the JSON Schema the CMS renders
 * the entry form from.
 *
 * Tips:
 * - A JSDoc comment on a field becomes its help text in the form
 * - Optional properties (`?`) are optional fields
 * - Supported controls: string, number, boolean, date (`string & tags.Format<'date-time'>`),
 *   email / url (`tags.Format`), string literal unions (select), arrays
 */

/** Authors collection - blog post authors, team members, etc. */
export interface Author {
  /** Full name */
  name: string;
  /** Short biography */
  bio: string;
  /** Profile image URL */
  avatar?: string & tags.Format<'url'>;
  /** Twitter handle (e.g., @username) */
  twitter?: string;
  /** Contact email */
  email?: string & tags.Format<'email'>;
}

/** Settings collection - site configuration, feature flags, etc. */
export interface Settings {
  /** Site name */
  siteName?: string;
  /** Contact email address */
  contactEmail?: string & tags.Format<'email'>;
}

export const dataSchemas = {
  authors: defineHostSchema<Author>({
    validate: typia.plain.createValidatePrune<Author>(),
    metadata: typia.json.schema<Author>(),
  }),
  settings: defineHostSchema<Settings>({
    validate: typia.plain.createValidatePrune<Settings>(),
    metadata: typia.json.schema<Settings>(),
  }),
};
