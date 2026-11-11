import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import { conlocaCMS } from '@conloca/astro-cms/node';
import { conlocaCloud } from '@conloca/cloud-astro';
import { defineConfig } from 'astro/config';
import { preparePublicEnvironment } from './scripts/public-environment.mjs';

import { schemaTypia } from './typia-vite.mjs';

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
      puckConfigPath: './src/puck.config.tsx',

      // The site's own src/pages/[...slug].astro owns routing; the integration injects no routes.
      routing: { enabled: false },

      assetsPath: './public/assets',

      // src/pages/[...slug].astro owns locale prefixes and hydrates the full
      // Puck tree once, preserving shared gallery and language contexts.
      siteStyles: './client/global.css',

      schemasPath: './src/schemas/data.ts',
    }),
    conlocaCloud({
      endpoint,
      puckConfigPath,
      previewBuild: false,
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./client', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },

    plugins: [...schemaTypia()],
  },
});
