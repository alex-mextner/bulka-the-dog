import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../client/global.css';
import BulkaSection from '../../client/pages/Index';
import { GalleryImage, GalleryLightbox, GalleryProvider, useGallery } from '../../client/components/Gallery';
import { LanguageContext } from '../../client/context/LanguageContext';
import { SiteRuntimeContext } from '../../client/cms/SiteRuntimeContext';
import type { Locale } from '../../client/cms/content-model';

const photos = {
  ru: { src: '/images/dog_home.webp', alt: 'RU custom alt', caption: 'RU custom habit' },
  en: { src: '/images/dog_car.webp', alt: 'EN custom alt', caption: 'EN custom habit' },
  rs: { src: '/images/dog_vet.webp', alt: 'SR custom alt', caption: 'SR custom habit' },
};

function Registry() {
  const { entries } = useGallery();
  return <output data-testid="gallery-registry">{JSON.stringify(entries)}</output>;
}

function Fixture() {
  const [language, setLanguage] = useState<Locale>('ru');
  const [revision, setRevision] = useState(0);
  const [shown, setShown] = useState(true);
  const [, rerender] = useState(0);
  const photo = { ...photos[language], caption: `${photos[language].caption}${revision ? ` ${revision}` : ''}` };
  return <SiteRuntimeContext.Provider value={true}>
    <LanguageContext.Provider value={{ language, setLanguage, availableLanguages: ['ru', 'rs', 'en'] }}>
      <GalleryProvider>
        <div className="p-4 flex gap-4">
          {(['ru', 'en', 'rs'] as const).map(locale => <button key={locale} onClick={() => setLanguage(locale)}>Locale {locale}</button>)}
          <button onClick={() => setRevision(value => value + 1)}>Change caption</button>
          <button onClick={() => rerender(value => value + 1)}>Same photos</button>
          <button onClick={() => setShown(value => !value)}>Toggle habits</button>
        </div>
        <GalleryImage src="/images/health1.webp" alt="Shared photo" caption="Shared registry entry" className="w-24 h-24" imgClassName="w-full h-full object-cover" />
        {shown && <BulkaSection section="habits" content={{
          // The same mounted block survives both locale and media edits.
          id: 'unchanged-habits-block',
          items: [{ id: 'custom-habit', title: 'Custom habit', body: 'Editable story', showPhotos: true, photo }],
        }} />}
        <Registry />
        <GalleryLightbox />
      </GalleryProvider>
    </LanguageContext.Provider>
  </SiteRuntimeContext.Provider>;
}

createRoot(document.getElementById('fixture-root')!).render(<Fixture />);
