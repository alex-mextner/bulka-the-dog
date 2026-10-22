import { createContext, useContext } from 'react';

// Only the published Astro island owns the browser document. The same Puck
// config also runs inside Conloca, where document/window belong to the editor.
export const SiteRuntimeContext = createContext(false);
export const useSiteRuntime = () => useContext(SiteRuntimeContext);
