import { useMemo } from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { useLanguage } from '@/hooks/useLanguage';
import BulkaSection from '@/pages/Index';
import { PageFrame } from './PageFrame';
import schema from './section-schema.json';
import { pageForLocale, type Locale } from './content-model';
import type { LocalizedPages } from './types';
import { SiteRuntimeContext } from './SiteRuntimeContext';

function ActivePage({ pages }: { pages: LocalizedPages }) {
  const { language } = useLanguage();
  const data = pageForLocale(pages, language);
  // These ten CMS blocks are flat sections. Render their shared components
  // directly so visitors never download Puck or the editor field definitions.
  // The same React tree is used for static HTML and browser hydration.
  return data ? <PageFrame {...data.root.props}>
    {data.content.map(block => <BulkaSection
      key={block.props.id}
      section={schema[block.type].kind}
      content={block.props}
    />)}
  </PageFrame> : null;
}

export default function BulkaPage({ pages, initialLanguage = 'ru', autoDetect = false }: {
  pages: LocalizedPages;
  initialLanguage?: Locale;
  autoDetect?: boolean;
}) {
  const availableLanguages = useMemo(() => Object.keys(pages) as Locale[], [pages]);
  return <SiteRuntimeContext.Provider value={true}>
    <LanguageProvider initialLanguage={initialLanguage} autoDetect={autoDetect} availableLanguages={availableLanguages}>
      <ActivePage pages={pages} />
    </LanguageProvider>
  </SiteRuntimeContext.Provider>;
}
