import { getTranslation, type Language } from '../lib/translations.ts';
import schema from './section-schema.json' with { type: 'json' };
import type { PhotoContent, SectionContentData } from './types.ts';

export const locales = ['ru', 'rs', 'en'] as const;
export const blockNames = ['Hero', 'Appearance', 'Habits', 'Skills', 'Health', 'Conditions', 'Questions', 'Game', 'Contact', 'PhotoGallery'] as const;

const pageTitles = {
  ru: 'Я Булка. Ищу дом в Белграде.',
  rs: 'Ja sam Bulka. Tražim dom u Beogradu.',
  en: "I'm Bulka. I'm looking for a home in Belgrade.",
};

function photo(seed: any, language: Language): PhotoContent {
  return {
    src: seed.src,
    ...(seed.thumbSrc ? { thumbSrc: seed.thumbSrc } : {}),
    alt: getTranslation(language, seed.altKey),
    caption: getTranslation(language, seed.captionKey),
  };
}

function copyFor(keys: string[], language: Language) {
  return Object.fromEntries(keys.map(key => [key.replaceAll('.', '__'), getTranslation(language, key)]));
}

/** One-time migration seed. Builds read .vxjson files, never this function. */
export function createSeedProps(name: typeof blockNames[number], language: Language): SectionContentData {
  const definition = schema[name] as any;
  const props: SectionContentData = {
    copy: copyFor(definition.copyKeys, language),
    ...(Object.keys(definition.photos).length ? {
      photos: Object.fromEntries(Object.entries(definition.photos).map(([key, value]) => [key, photo(value, language)])),
    } : {}),
  };
  if (name === 'Habits') props.items = schema.Habits.itemDefaults.map(item => ({
    id: item.id,
    emoji: item.emoji,
    title: getTranslation(language, `ui.habits.${item.id}_title`),
    body: getTranslation(language, `habits.${item.id}`),
    photo: photo(item.photo, language),
    secondaryPhoto: photo(item.secondaryPhoto, language),
    showPhotos: item.showPhotos,
  }));
  if (name === 'Skills') props.commands = ['sit', 'lie', 'place', 'come', 'paw', 'ball', 'no'].map(key => ({ label: getTranslation(language, `ui.skills.cmd_${key}`) }));
  if (name === 'Health') props.healthItems = ['Crosshair', 'Bone', 'Worm', 'Ban'].map((icon, i) => ({ icon, body: getTranslation(language, `health.bullet${i + 1}`) }));
  if (name === 'Questions') props.items = ['kids', 'rental', 'monthly_cost', 'guarantee', 'other_pets', 'health', 'remote', 'deadline'].map(id => ({
    id,
    question: getTranslation(language, `faq.${id}.q`),
    answer: getTranslation(language, `faq.${id}.a`),
  }));
  if (name === 'PhotoGallery') props.photosList = schema.PhotoGallery.photoDefaults.map(item => photo(item, language));
  if (name === 'Contact') props.mapUrl = 'https://www.google.com/maps/search/?api=1&query=Super+Vero+Zira+Vukov+Spomenik+Belgrade';
  return props;
}

export function createSeedPage(language: Language) {
  const rootProps = {
    locale: language,
    title: pageTitles[language],
    description: getTranslation(language, 'hero.intro'),
    socialImage: '/og-image.jpg',
    copy: copyFor(schema.root.copyKeys, language),
  };
  return {
    id: 'bulka-home',
    created: '2026-10-22T00:00:00.000Z',
    modified: '2026-10-22T00:00:00.000Z',
    type: 'puck',
    meta: { title: rootProps.title, description: rootProps.description },
    content: {
      puckData: {
        root: { props: rootProps },
        content: blockNames.map(name => ({
          type: name,
          props: { id: `bulka-${schema[name].kind}`, ...createSeedProps(name, language) },
        })),
        zones: {},
      },
    },
  };
}
