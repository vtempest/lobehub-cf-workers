import type { Metadata } from 'next';

import { APP_DESCRIPTION, APP_NAME, BASE_URL } from './constants';

/**
 * Default OpenGraph image. There is no per-page image generator route in this
 * app, so every page shares the site card; add a `/docs-og/[...slug]` route and
 * point `getPageImage` at it to make them per-page.
 */
const DEFAULT_OG_IMAGE = '/android-chrome-512x512.png';

/**
 * Merge page metadata over the site defaults, so a page only has to declare
 * what differs.
 */
export function createMetadata(override: Metadata = {}): Metadata {
  return {
    ...override,
    description: override.description ?? APP_DESCRIPTION,
    metadataBase: new URL(BASE_URL),
    openGraph: {
      description: override.description ?? APP_DESCRIPTION,
      images: DEFAULT_OG_IMAGE,
      siteName: APP_NAME,
      title: override.title ?? APP_NAME,
      type: 'website',
      ...override.openGraph,
    },
    title: override.title ?? APP_NAME,
    twitter: {
      card: 'summary_large_image',
      description: override.description ?? APP_DESCRIPTION,
      images: DEFAULT_OG_IMAGE,
      title: override.title ?? APP_NAME,
      ...override.twitter,
    },
  };
}

/** The social card for a docs page. */
export function getPageImage(_page: { slugs: string[] }): { url: string } {
  return { url: DEFAULT_OG_IMAGE };
}
