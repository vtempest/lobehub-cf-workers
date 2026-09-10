'use client';

/**
 * Better Auth browser client.
 *
 * The plugin list mirrors the server's, which is what gives the client typed
 * `signIn.social`, `signIn.magicLink`, `signIn.anonymous`, `oneTap()` and
 * `subscription.*` calls.
 *
 * Two things this file is deliberate about:
 *
 *   - **baseURL is the origin the page was served from.** This app ships its
 *     own `/api/auth` routes on every deployment (custom domain, the
 *     `*.workers.dev` name, a preview version, localhost), so a hardcoded base
 *     URL sends auth requests to a different host — in a production build it
 *     resolves to the build-time `NEXT_PUBLIC_BASE_URL`, which is
 *     `http://localhost:3000` unless someone remembered to set it, and every
 *     sign-in, session lookup and One Tap callback fails the CORS preflight.
 *   - **The Google client id arrives at runtime.** `GOOGLE_CLIENT_ID` is a
 *     Worker secret and is not in the browser bundle, so One Tap consumers
 *     build a client once `/api/auth/providers` has answered — see
 *     `createAppAuthClient` and `hooks/use-auth-providers.ts`.
 */
import { stripeClient } from '@better-auth/stripe/client';
import { anonymousClient, magicLinkClient, oneTapClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { ONE_TAP_CLIENT_OPTIONS } from './auth/one-tap';
import { BASE_URL } from './constants';

/** The origin to talk to. `BASE_URL` is only the SSR fallback. */
const baseURL = typeof window === 'undefined' ? BASE_URL : window.location.origin;

/** Create an auth client with the Google client id available at that moment. */
export function createAppAuthClient(
  googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
) {
  return createAuthClient({
    baseURL,
    plugins: [
      oneTapClient({ ...ONE_TAP_CLIENT_OPTIONS, clientId: googleClientId }),
      magicLinkClient(),
      anonymousClient(),
      stripeClient({ subscription: true }),
    ],
  });
}

/**
 * The shared client for everything that is not One Tap. It carries whatever
 * `NEXT_PUBLIC_GOOGLE_CLIENT_ID` was set at build time (often nothing), which
 * is irrelevant to session lookups, redirect OAuth and magic links — only the
 * One Tap prompt needs the id, and it uses a client of its own.
 */
export const authClient = createAppAuthClient();

export const { getSession, signIn, signOut, signUp, useSession } = authClient;
