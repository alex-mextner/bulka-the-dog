import { createContext, useContext, useMemo, type ReactNode } from 'react';

export const CmsCopyContext = createContext<Record<string, string>>({});

/** CMS fields override copy only inside their own block. An intentionally
 * empty string is content too; it must not resurrect the migration fallback. */
export function CmsCopyProvider({ value, children }: {
  value: Record<string, string>;
  children: ReactNode;
}) {
  const parent = useContext(CmsCopyContext);
  const merged = useMemo(() => ({ ...parent, ...value }), [parent, value]);
  return <CmsCopyContext.Provider value={merged}>{children}</CmsCopyContext.Provider>;
}
