import { useContext, useEffect, type ReactNode } from 'react';
import { Header } from '@/components/Header';
import { LanguageContext } from '@/context/LanguageContext';
import BulkaSection from '@/pages/Index';
import { AppProviders } from './AppProviders';
import { CmsCopyProvider } from './CopyContext';
import { htmlLanguage, normalizeLocale, safePublicUrl } from './content-model';
import type { PageRootProps } from './types';
import { useSiteRuntime } from './SiteRuntimeContext';
import { publicEnvironment } from '../../src/generated/public-environment';

function DocumentMetadata({ locale, title, description, socialImage }: PageRootProps) {
  useEffect(() => {
    document.documentElement.lang = htmlLanguage(locale);
    document.title = title;
    const values = {
      'meta[name="description"]': description,
      'meta[property="og:title"]': title,
      'meta[property="og:description"]': description,
      'meta[property="og:locale"]': { ru: 'ru_RU', rs: 'sr_RS', en: 'en_US' }[locale],
      'meta[name="twitter:title"]': title,
      'meta[name="twitter:description"]': description,
    };
    for (const [selector, content] of Object.entries(values)) {
      document.querySelector(selector)?.setAttribute('content', content || '');
    }
    // Language preference changes visible copy without navigating. Canonical,
    // og:url and structured-data identity remain owned by the Astro route.
    const structuredData = document.querySelector('script[type="application/ld+json"]');
    if (structuredData?.textContent) {
      try {
        const data = JSON.parse(structuredData.textContent);
        data.headline = title;
        data.description = description;
        data.inLanguage = htmlLanguage(locale);
        structuredData.textContent = JSON.stringify(data);
      } catch { /* Leave unrelated structured data intact. */ }
    }
    if (safePublicUrl(socialImage)) {
      for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
        document.querySelector(selector)?.setAttribute('content', new URL(socialImage, publicEnvironment.siteUrl).href);
      }
    }
  }, [locale, title, description, socialImage]);
  return null;
}

/** The editor and the built site use the same shell, stylesheet and blocks. */
export function PageFrame({ children, locale = "ru", title = "Bulka", description = "", socialImage = "/og-image.jpg", copy = {}, navigation }: Partial<PageRootProps> & { children: ReactNode }) {
  const props = { locale, title, description, socialImage, copy, navigation };
  const language = useContext(LanguageContext);
  const interactive = useSiteRuntime();
  if (!language) {
    const locale = normalizeLocale(props.locale);
    return <LanguageContext.Provider value={{ language: locale, setLanguage: () => {}, availableLanguages: [locale] }}>
      <PageFrame {...props}>{children}</PageFrame>
    </LanguageContext.Provider>;
  }
  return <CmsCopyProvider value={props.copy || {}}>
    <AppProviders>
      {interactive && <DocumentMetadata {...props} />}
      <div id="root" className="bg-background" style={{ minHeight: 'max(100dvh, 100lvh, var(--bulka-viewport-height))' }}>
        <div style={{ display: 'contents' }} inert={!interactive}><Header navigation={props.navigation} /></div>
        <main id="main">{children}</main>
        <BulkaSection section="footer" content={{ copy: props.copy }} />
      </div>
    </AppProviders>
  </CmsCopyProvider>;
}
