import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { ensurePublicEnvironmentForTests } from './scripts/public-environment.mjs';

ensurePublicEnvironmentForTests();

export default defineConfig({
  resolve: { alias: {
    '@': fileURLToPath(new URL('./client', import.meta.url)),
    '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    'astro:content': fileURLToPath(new URL('./tests/fixtures/astro-content.ts', import.meta.url)),
  } },
  test: {
    include: ['client/**/*.spec.{ts,tsx}', 'shared/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
