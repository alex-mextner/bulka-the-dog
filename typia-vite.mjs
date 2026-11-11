import { fileURLToPath } from 'node:url';
import ttsc from '@ttsc/unplugin/vite';
import { TtscCompiler } from 'ttsc';

const project = fileURLToPath(new URL('./tsconfig.typia.json', import.meta.url));

/**
 * Compiles the Typia call sites in src/schemas/ into generated validators and
 * JSON Schema metadata. Astro's content config and the CMS editor both load
 * those modules through this Vite pipeline.
 *
 * @returns {import('vite').Plugin[]}
 */
export function schemaTypia() {
  // Builds ttsc's typia plugin now, before Vite runs: a first build on a cold cache takes minutes, and Astro's content
  // sync gives the module that needs it 60 s. Warm, this only checks the cache.
  new TtscCompiler({ tsconfig: project }).prepare();
  const plugins = ttsc({ project });
  return (Array.isArray(plugins) ? plugins : [plugins]).map((plugin) => {
    const transform = plugin.transform;
    if (!transform) return plugin;
    const hook = typeof transform === 'function' ? { handler: transform } : transform;
    return {
      ...plugin,
      transform: {
        ...hook,
        filter: { ...hook.filter, id: /[\\/]src[\\/]schemas[\\/]/ },
      },
    };
  });
}
