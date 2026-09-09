/**
 * Typed accessor for the Cloudflare bindings this app runs on.
 *
 * Bindings arrive as the Worker's `env` argument, which is constant for the
 * life of an isolate. `worker/index.ts` publishes it here on every request so
 * that server modules (`lib/db`, `lib/ai`, `lib/email`, …) can reach a service
 * without `env` being threaded through every call site.
 */

export interface CloudflareEnv {
  /** Static assets served by Workers Assets. */
  ASSETS: Fetcher;
  /** Cloudflare Images — backs the /_next/image endpoint. */
  IMAGES: ImagesBinding;

  /** D1 — the only datastore. */
  DB: D1Database;
  /**
   * How this deployment starts D1 sessions. A plain Worker variable so read
   * replication can be tuned (or rolled back) from the dashboard without a
   * redeploy — see `lib/db/d1-session.ts`.
   */
  D1_SESSION_MODE?: string;
  /** Emit the replica-routing diagnostics headers on every response. */
  D1_SESSION_DEBUG?: string;

  /** ISR / fragment cache, written by vinext. */
  VINEXT_CACHE: KVNamespace;
  /** Rate limits and short-lived application caches. */
  APP_CACHE: KVNamespace;

  /** User uploads and generated artifacts. */
  FILES: R2Bucket;

  /** Workers AI — every chat completion and embedding. */
  AI: Ai;
  /** Optional AI Gateway id; when set, inference is routed through it. */
  AI_GATEWAY_ID?: string;

  /** Cloudflare Email Routing. Absent when the account has no Email Routing zone. */
  SEND_EMAIL?: { send(message: unknown): Promise<void> };

  /** Semantic search over messages. Optional — see wrangler.jsonc. */
  VECTORIZE?: VectorizeIndex;

  APP_NAME?: string;

  // Secrets (`wrangler secret put`). All optional so an unconfigured
  // deployment degrades on the feature that needs them, not at boot.
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

let bindings: CloudflareEnv | null = null;

/** Publish the Worker `env` for this isolate. Called by the Worker entry. */
export function setBindings(env: CloudflareEnv): void {
  bindings = env;
}

/**
 * The current bindings.
 *
 * Throws rather than returning a partial object: every caller needs a real
 * service, and a missing binding is a deployment mistake worth surfacing
 * loudly instead of failing later with `undefined is not a function`.
 */
export function getBindings(): CloudflareEnv {
  if (!bindings) {
    throw new Error(
      'Cloudflare bindings are not available. This code path must run inside a Worker request (worker/index.ts calls setBindings).',
    );
  }
  return bindings;
}

/** The bindings, or null outside a Worker (build steps, scripts, tests). */
export function tryGetBindings(): CloudflareEnv | null {
  return bindings;
}

/** Test hook: install a stub env, or clear it with `null`. */
export function __setBindingsForTests(env: CloudflareEnv | null): void {
  bindings = env;
}
