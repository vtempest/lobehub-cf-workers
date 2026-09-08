import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Build-time / dev-time environment.
 *
 * At runtime on Workers, secrets come from bindings (`wrangler secret put`) and
 * are read through `lib/cf/bindings.ts`; this schema covers the values needed
 * outside a request — `vinext dev`, `drizzle-kit`, and client-visible config
 * that has to be inlined at build time.
 */
export const env = createEnv({
  client: {
    NEXT_PUBLIC_APP_DESCRIPTION: z.string().optional(),
    NEXT_PUBLIC_APP_EMAIL: z.string().optional(),
    NEXT_PUBLIC_APP_NAME: z.string().optional(),
    NEXT_PUBLIC_BASE_URL: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_APP_DESCRIPTION: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    NEXT_PUBLIC_APP_EMAIL: process.env.NEXT_PUBLIC_APP_EMAIL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  },
  server: {
    BETTER_AUTH_SECRET: z.string().optional(),
    // Used by drizzle-kit studio and `wrangler` from CI; not needed at runtime.
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_API_TOKEN: z.string().optional(),
    CLOUDFLARE_D1_DATABASE_ID: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
