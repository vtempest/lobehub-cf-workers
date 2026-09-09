/**
 * Cloudflare Worker entry point.
 *
 * Everything the app needs at runtime arrives here as a binding: D1 for data,
 * KV for cache, R2 for files, Workers AI for inference, Email Routing for mail.
 * The handler publishes `env` to the app's binding accessor, opens one D1
 * session for the request (read replication — see lib/db/d1-session.ts), and
 * then hands the request to vinext's App Router runtime.
 */
import handler from 'vinext/server/app-router-entry';
import { KVCacheHandler } from 'vinext/cloudflare';
import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
  isImageOptimizationPath,
} from 'vinext/server/image-optimization';
import { setCacheHandler } from 'vinext/shims/cache';

import { setBindings, type CloudflareEnv } from '../lib/cf/bindings';
import { applyD1Bookmark, runWithD1Session } from '../lib/db/d1-session';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    // Bindings are constant per isolate; publishing them here is what lets
    // `lib/db`, `lib/email`, `lib/ai` and friends reach Cloudflare services
    // without threading `env` through every call site.
    setBindings(env);

    // One D1 session per request, so every query this request makes sees one
    // sequentially consistent view of the database even when read replicas
    // answer them. `applyD1Bookmark` hands the closing bookmark back to the
    // client so its next request resumes from at least this version.
    // See lib/db/d1-session.ts.
    return runWithD1Session(request, env.D1_SESSION_MODE, async () => {
      const response = await handle(request, env, ctx);
      return applyD1Bookmark(response, { debug: env.D1_SESSION_DEBUG === '1' });
    });
  },
};

/** The request pipeline itself, run inside the D1 session scope above. */
async function handle(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  // KV-backed ISR cache. The vinext RSC entry registers `ctx` in ALS so
  // background KV writes go through waitUntil — without this every request
  // would MISS.
  setCacheHandler(new KVCacheHandler(env.VINEXT_CACHE));

  const url = new URL(request.url);

  // Image optimization through the Cloudflare Images binding.
  if (isImageOptimizationPath(url.pathname)) {
    const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
    return handleImageOptimization(
      request,
      {
        fetchAsset: (path: string) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (
          body: ReadableStream,
          { format, quality, width }: { width: number; format: string; quality: number },
        ) => {
          const result = await env.IMAGES.input(body)
            .transform(width > 0 ? { width } : {})
            // vinext hands us a MIME string; the binding wants its own union.
            .output({ format: format as ImageOutputOptions['format'], quality });
          return result.response();
        },
      },
      allowedWidths,
    );
  }

  return handler.fetch(request, env, ctx);
}
