'use client';

/**
 * Better Auth browser client.
 *
 * The plugin list mirrors the server's, which is what gives the client typed
 * `signIn.magicLink`, `signIn.anonymous` and `subscription.*` calls.
 */
import { stripeClient } from '@better-auth/stripe/client';
import { anonymousClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), anonymousClient(), stripeClient({ subscription: true })],
});

export const { getSession, signIn, signOut, signUp, useSession } = authClient;
