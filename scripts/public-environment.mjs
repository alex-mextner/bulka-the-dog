import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** Explicit public allowlist. Never spread process.env into client code. */
export function publicEnvironmentFrom(environment) {
  const enabled = value => value === '1' || value === 'true';
  // An empty environment entry is unset; explicit '0'/'false' still override.
  const analyticsFlag = environment.PUBLIC_ENABLE_ANALYTICS || undefined;
  const gameFlag = environment.PUBLIC_ENABLE_GAME || environment.VITE_ENABLE_GAME;
  return {
    publicBaseUrl: environment.CONLOCA_PUBLIC_BASE_URL ||
      (environment.VERCEL_URL ? `https://${environment.VERCEL_URL}` : 'http://localhost:8080'),
    // SEO belongs to the stable public site, independently of editor asset URLs.
    siteUrl: environment.PUBLIC_SITE_URL || 'https://bulka.rs',
    baseUrl: '/',
    enableGame: enabled(gameFlag),
    // Preserve the original site's analytics default. The explicit opt-out is
    // shared by all providers and is independent of the build host/environment.
    enableAnalytics: analyticsFlag === undefined || enabled(analyticsFlag),
    enableDonations: enabled(environment.VITE_ENABLE_DONATIONS),
    donationUrl: environment.VITE_DONATION_URL || '',
  };
}

/** Ordinary source import works in both Vite and published Conloca's esbuild.
 * The generated module is ignored, contains public values only, and does not
 * touch tracked source or authored content. Unchanged bytes avoid watch loops.
 */
export function preparePublicEnvironment(environment = process.env) {
  const value = publicEnvironmentFrom(environment);
  const path = fileURLToPath(new URL('../src/generated/public-environment.ts', import.meta.url));
  const source = '// Generated from an explicit public allowlist by Astro/Vitest config.\n' +
    `export const publicEnvironment = ${JSON.stringify(value, null, 2)} as const;\n`;
  let previous;
  try { previous = readFileSync(path, 'utf8'); } catch { /* First run in a fresh checkout. */ }
  if (previous !== source) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return value;
}

/** Unit tests can start in a fresh checkout, but must not replace the public
 * constants that produced an existing build with the test process's defaults.
 * Astro still calls preparePublicEnvironment for every new build.
 */
export function ensurePublicEnvironmentForTests() {
  const path = fileURLToPath(new URL('../src/generated/public-environment.ts', import.meta.url));
  if (!existsSync(path)) preparePublicEnvironment();
}
