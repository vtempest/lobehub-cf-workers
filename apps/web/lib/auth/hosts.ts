/**
 * @fileoverview The hosts this deployment answers on, and the origin allowlist
 * better-auth checks every state-changing auth request against.
 *
 * Kept out of `../auth` so it can be reasoned about (and unit tested) on its
 * own: building the auth instance needs the D1 binding, and this is the part
 * that decides whether a sign-in is accepted at all. Getting it wrong does not
 * produce a subtle bug — every `POST /api/auth/sign-in/*` comes back 403
 * "Invalid origin" before it reaches a handler, which is what a broken login
 * page usually turns out to be.
 */

import { BASE_URL } from '../constants';

/**
 * Every host that serves this app out of the box.
 *
 * A Workers deployment is reachable on at least two names — the custom domain
 * and the `*.workers.dev` one wrangler prints — and preview versions get a
 * third. better-auth derives one base URL per request from this list, so a
 * visitor on the preview URL keeps that URL for their cookies, OAuth callback
 * and magic link instead of being handed production's halfway through signing
 * in.
 *
 * This is an allowlist rather than "whatever the Host header says" on purpose:
 * an unchecked host would let a spoofed request mint magic links pointing at
 * someone else's domain. Deployment-specific names belong in
 * `BETTER_AUTH_ALLOWED_HOSTS` (comma-separated) or fall out of
 * `BETTER_AUTH_URL` / `NEXT_PUBLIC_BASE_URL`, both of which are added below.
 */
export const DEFAULT_ALLOWED_HOSTS = [
  '*.workers.dev',
  '*.vercel.app',
  'localhost:3000',
  'localhost:5173',
  'localhost:8787',
  '127.0.0.1:3000',
  '127.0.0.1:8787',
];

/**
 * Origin patterns accepted in addition to the ones implied by the hosts above.
 * Kept for anything that is an origin rather than a host — including whatever
 * `BETTER_AUTH_TRUSTED_ORIGINS` supplies.
 */
export const DEFAULT_TRUSTED_ORIGINS = [BASE_URL, 'http://localhost:3000'];

/** Split a comma-separated env value into trimmed, non-empty entries. */
export function parseList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The host (including port) of a URL or bare host string, or `null` when the
 * value is not something a browser could be served from.
 */
export function hostOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host || null;
  } catch {
    return null;
  }
}

/**
 * The hosts better-auth may resolve a base URL for: the built-in list, plus
 * anything an operator adds via `BETTER_AUTH_ALLOWED_HOSTS`, plus the host of
 * any explicitly configured base URL so pinning one does not lock the others
 * out.
 *
 * Entries may be given as hosts (`chat.example.com`), origins
 * (`https://chat.example.com`) or wildcard patterns (`*.workers.dev`); origins
 * are reduced to their host, which is what better-auth matches on.
 */
export function buildAllowedHosts({
  configuredBaseURL,
  extraHosts,
}: {
  configuredBaseURL?: string;
  extraHosts?: string;
} = {}): string[] {
  const entries = [
    ...DEFAULT_ALLOWED_HOSTS,
    ...parseList(extraHosts),
    ...(configuredBaseURL ? [configuredBaseURL] : []),
  ];

  const hosts = entries.map((entry) =>
    // Wildcard patterns are matched against the host as written; running them
    // through the URL parser would mangle `*.workers.dev`.
    entry.includes('*') ? entry.replace(/^https?:\/\//, '').split('/')[0] : hostOf(entry),
  );

  return Array.from(new Set(hosts.filter((host): host is string => Boolean(host))));
}

/**
 * Origins accepted by the CSRF origin check on top of the ones better-auth
 * already derives from {@link buildAllowedHosts}.
 */
export function buildTrustedOrigins({
  configuredBaseURL,
  extraOrigins,
}: {
  configuredBaseURL?: string;
  extraOrigins?: string;
} = {}): string[] {
  return Array.from(
    new Set(
      [
        ...DEFAULT_TRUSTED_ORIGINS,
        ...(configuredBaseURL ? [configuredBaseURL] : []),
        ...parseList(extraOrigins),
      ]
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );
}
