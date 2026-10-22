import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import { conlocaCMS } from '@conloca/astro-cms/node';
import { conlocaCloud } from '@conloca/cloud-astro';
import { defineConfig } from 'astro/config';
import { preparePublicEnvironment } from './scripts/public-environment.mjs';

// Preview deployments register their own origin. Never register a branch build
// against the production site or put a build token in source control.
const { publicBaseUrl, siteUrl } = preparePublicEnvironment();
const endpoint = process.env.CONLOCA_ENDPOINT || 'https://alex-mextner.conloca.com';
const puckConfigPath = './src/puck.config.tsx';

export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    react(),
    conlocaCMS({
      contentRoot: './content',
      puckConfigPath,
      assetsPath: './public/assets',
      siteStyles: './client/global.css',
      // src/pages/[...slug].astro owns locale prefixes and hydrates the full
      // Puck tree once, preserving shared gallery and language contexts.
    }),
    conlocaCloud({
      endpoint,
      puckConfigPath,
      publicBaseUrl,
      previewBuild: false,
      requireRegistration: process.env.CONLOCA_REQUIRE_REGISTRATION === '1',
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./client', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
  },
});
