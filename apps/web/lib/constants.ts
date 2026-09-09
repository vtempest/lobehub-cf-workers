/**
 * Static app identity.
 *
 * These are read during render on both the server and the client, so they come
 * from `NEXT_PUBLIC_*` build-time values rather than Worker secrets.
 */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'LobeHub';

export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'An open-source AI chat workspace running entirely on Cloudflare — D1, R2, KV, Workers AI and Email Routing.';

/** Sender and contact address. Must be on a zone with Email Routing enabled. */
export const APP_EMAIL = process.env.NEXT_PUBLIC_APP_EMAIL || 'noreply@lobehub.com';

export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

/** Shown on the legal pages. Bump when the terms or privacy policy change. */
export const LAST_REVISED_DATE = 'September 9, 2026';

export const DOCS_TITLE = `${APP_NAME} Docs`;

/** Filter chips in the docs search dialog. `undefined` means "no filter". */
export const tags: { name: string; description: string; value: string | undefined }[] = [
  { description: 'Search everything', name: 'All', value: undefined },
  { description: 'Guides and concepts', name: 'Guides', value: 'docs' },
  { description: 'Endpoint reference', name: 'API', value: 'api' },
];
