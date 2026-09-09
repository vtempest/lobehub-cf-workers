/**
 * Workers KV helpers: short-lived caches and rate limits.
 *
 * KV is eventually consistent, so these are advisory. That is fine for what
 * they guard — a rate limit that occasionally lets an extra request through is
 * cheap insurance against runaway loops, not a security boundary.
 */
import { getBindings } from '../cf/bindings';

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** When the window rolls over, as epoch milliseconds. */
  resetAt: number;
}

interface CounterState {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter keyed by `key`.
 *
 * The window boundary is stored with the count, so a caller that goes quiet
 * gets a fresh window rather than inheriting an old one, and the KV entry
 * expires on its own once the window has passed.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const kv = getBindings().APP_CACHE;
  const namespaced = `ratelimit:${key}`;
  const now = Date.now();

  const existing = await kv.get<CounterState>(namespaced, 'json');
  const state: CounterState =
    existing && existing.resetAt > now
      ? { count: existing.count + 1, resetAt: existing.resetAt }
      : { count: 1, resetAt: now + windowSeconds * 1000 };

  await kv.put(namespaced, JSON.stringify(state), {
    // Round up so the entry outlives the window it describes.
    expirationTtl: Math.max(60, Math.ceil((state.resetAt - now) / 1000)),
  });

  return {
    allowed: state.count <= limit,
    remaining: Math.max(0, limit - state.count),
    resetAt: state.resetAt,
  };
}

/** Read a cached JSON value, or null when it is absent or expired. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  return getBindings().APP_CACHE.get<T>(`cache:${key}`, 'json');
}

/** Cache a JSON value for `ttlSeconds` (KV's floor is 60). */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await getBindings().APP_CACHE.put(`cache:${key}`, JSON.stringify(value), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
}

export async function cacheDelete(key: string): Promise<void> {
  await getBindings().APP_CACHE.delete(`cache:${key}`);
}
