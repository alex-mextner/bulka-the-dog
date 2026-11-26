import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Only the published Astro island owns the browser document. The same Puck
// config also runs inside Conloca, where document/window belong to the editor.
export const SiteRuntimeContext = createContext(false);
export const useSiteRuntime = () => useContext(SiteRuntimeContext);

const EditorPhotoOrigin = createContext<string | undefined>(undefined);
export const useEditorPhotoOrigin = () => useContext(EditorPhotoOrigin);

/** Only the mounted Puck root can supply a frame origin. Static rendering keeps it unset. */
export function EditorPhotoFrame({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<string>();
  useEffect(() => { setOrigin(window.location.origin); }, []);
  return <EditorPhotoOrigin.Provider value={origin}>{children}</EditorPhotoOrigin.Provider>;
}
