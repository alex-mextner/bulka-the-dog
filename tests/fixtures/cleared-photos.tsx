import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../client/global.css';
import BulkaSection from '../../client/pages/Index';
import PhotoStrip from '../../client/components/PhotoStrip';
import { GalleryImage, GalleryLightbox, GalleryProvider, useGallery } from '../../client/components/Gallery';
import { LanguageContext } from '../../client/context/LanguageContext';
import { SiteRuntimeContext } from '../../client/cms/SiteRuntimeContext';

const source = '/images/photo-set/ps_portrait.webp';
const thumbnail = '/images/photo-set/thumbs/ps_portrait.webp';

function Registry() {
  const { entries } = useGallery();
  return <output data-testid="gallery-registry">{JSON.stringify(entries)}</output>;
}

function Fixture() {
  const query = new URLSearchParams(window.location.search);
  const habits = query.get('mode') === 'habits';
  const [src, setSrc] = useState(query.get('start') === 'empty' ? '' : source);
  return <SiteRuntimeContext.Provider value={true}>
    <LanguageContext.Provider value={{ language: 'en', setLanguage: () => {}, availableLanguages: ['en'] }}>
      <GalleryProvider>
        {/* Fixture-only sizes do not depend on Tailwind scanning test files.
            Tall stories give the sticky photo a real visible reading range. */}
        <style>{'[data-habit-item] { min-height: 500px; }'}</style>
        <div className="p-4 flex gap-4">
          <button onClick={() => setSrc('')}>Clear source</button>
          <button onClick={() => setSrc(' \t\n ')}>Whitespace source</button>
          <button onClick={() => setSrc(source)}>Restore source</button>
        </div>
        <div style={{ width: 96, height: 96 }}>
          <GalleryImage src="/images/health1.webp" alt="Shared photo" caption="Shared entry" style={{ width: 96, height: 96, objectFit: 'cover' }} />
        </div>
        {habits ? <BulkaSection section="habits" content={{
          id: 'same-habits-block',
          items: [
            { id: 'first', title: 'First habit', body: 'First editable story', showPhotos: true,
              photo: { src, alt: 'First habit photo', caption: 'First habit photo' },
              secondaryPhoto: { src: '', alt: '' } },
            { id: 'second', title: 'Second habit', body: 'Second editable story', showPhotos: true,
              photo: { src: '/images/dog_car.webp', alt: 'Second habit photo', caption: 'Second habit photo' } },
          ],
        }} /> : <>
          <div data-testid="editable-gallery-image" style={{ width: 256, height: 256 }}>
            <GalleryImage src={src} thumbSrc={thumbnail} alt="Editable photo" caption="Editable entry" style={{ width: 256, height: 256, objectFit: 'cover' }} />
          </div>
          <div data-testid="editable-strip">
            <PhotoStrip images={[{ src, thumbSrc: thumbnail, alt: 'Strip photo', caption: 'Editable strip card' }]} />
          </div>
        </>}
        <Registry />
        <GalleryLightbox />
        <div style={{ height: '150vh' }} />
      </GalleryProvider>
    </LanguageContext.Provider>
  </SiteRuntimeContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
