import type { Data } from '@puckeditor/core';
import type { Locale } from './content-model';

export interface PhotoContent {
  src: string;
  thumbSrc?: string;
  alt?: string;
  caption?: string;
}

export interface ContentItem {
  id?: string;
  title?: string;
  body?: string;
  emoji?: string;
  photo?: PhotoContent;
  secondaryPhoto?: PhotoContent;
  showPhotos?: boolean;
  question?: string;
  answer?: string;
}

export interface SectionContentData {
  id?: string;
  copy?: Record<string, string>;
  photos?: Record<string, PhotoContent>;
  photosList?: PhotoContent[];
  items?: ContentItem[];
  commands?: { label: string }[];
  healthItems?: { body: string; icon: string }[];
  mapUrl?: string;
}

export interface PageRootProps {
  locale: Locale;
  title: string;
  description: string;
  socialImage: string;
  copy: Record<string, string>;
  navigation?: { id: string; key: string }[];
}

export type BulkaBlockName = 'Hero' | 'Appearance' | 'Habits' | 'Skills' | 'Health' | 'Conditions' | 'Questions' | 'Game' | 'Contact' | 'PhotoGallery';
export type BulkaComponents = Record<BulkaBlockName, SectionContentData>;
export type BulkaRootFields = Pick<PageRootProps, 'locale' | 'socialImage' | 'copy'>;
export type BulkaPageData = Data<BulkaComponents, PageRootProps>;

/** A CMS page can exist in only some of the supported languages. */
export type LocalizedPages = Partial<Record<Locale, BulkaPageData>>;
