/**
 * Every Better Auth endpoint: sign-in, callbacks, session, One Tap, magic link.
 *
 * The instance is built here rather than handed over as the lazy `auth` proxy.
 * `toNextJsHandler` accepts either an auth instance or a bare handler function
 * and tells them apart with `'handler' in value` — a check the proxy cannot
 * answer for a property it resolves on access, so it took the bare-function
 * branch and every auth request died with "auth is not a function". Building
 * the real instance inside the request (where the D1 binding exists) keeps that
 * unambiguous.
 */
import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/lib/auth';

let handlers: ReturnType<typeof toNextJsHandler> | null = null;

function getHandlers() {
  if (!handlers) handlers = toNextJsHandler(getAuth());
  return handlers;
}

export async function GET(request: Request) {
  return getHandlers().GET(request);
}

export async function POST(request: Request) {
  return getHandlers().POST(request);
}
