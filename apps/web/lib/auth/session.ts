/**
 * Server-side session helpers.
 *
 * `headers()` is read here rather than by every caller so route handlers and
 * server components share one way of asking who is signed in.
 */
import { headers } from 'next/headers';

import { auth } from '../auth';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
export type ActiveSession = NonNullable<Session>;

/** The current session, or null when the request is not signed in. */
export async function getSession(): Promise<ActiveSession | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session ?? null;
  } catch (error) {
    console.error('[auth] session lookup failed:', error);
    return null;
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/**
 * The current session, or a thrown `UnauthorizedError`. Callers turn that into
 * a 401 — see the route handlers under app/api.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError();
  return session;
}
