'use client';

/**
 * Runtime lookup of the OAuth providers this deployment can actually complete a
 * sign-in with.
 *
 * OAuth credentials live in Worker secrets, so the browser bundle cannot know
 * which providers exist — `/api/auth/providers` answers that, and hands back the
 * public Google client id One Tap needs. Every caller shares one in-flight
 * request: the login page and the One Tap prompt can mount at once, and two
 * copies of the same answer is wasted latency.
 */

import { useEffect, useState } from 'react';

export interface AuthProviders {
  /** Public Google client id, or `''` when Google is not configured. */
  googleClientId: string;
  /** Provider ids with usable credentials, e.g. `['google', 'discord']`. */
  providers: string[];
}

const NONE: AuthProviders = { googleClientId: '', providers: [] };

/** In-flight (or settled) request shared by every caller on the page. */
let pending: Promise<AuthProviders> | null = null;

/**
 * Resolve the configured providers, reusing the request across callers.
 * A failed lookup is not cached, so a later mount can retry.
 */
export function fetchAuthProviders(): Promise<AuthProviders> {
  if (!pending) {
    pending = fetch('/api/auth/providers')
      .then((response) => (response.ok ? (response.json() as Promise<Partial<AuthProviders>>) : null))
      .then((data): AuthProviders => ({
        googleClientId: typeof data?.googleClientId === 'string' ? data.googleClientId : '',
        providers: Array.isArray(data?.providers) ? data.providers : [],
      }))
      .catch((error) => {
        console.error('[auth] failed to load providers:', error);
        pending = null;
        return NONE;
      });
  }
  return pending;
}

/** React binding over {@link fetchAuthProviders}. */
export function useAuthProviders() {
  const [resolved, setResolved] = useState<AuthProviders>(NONE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAuthProviders().then((value) => {
      if (cancelled) return;
      setResolved(value);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...resolved,
    /** Whether any social provider is available at all. */
    hasSocialProviders: resolved.providers.length > 0,
    isLoading,
  };
}
