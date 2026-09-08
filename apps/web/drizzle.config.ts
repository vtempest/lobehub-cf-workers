import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Schema authoring + migration generation for Cloudflare D1.
 *
 * `bun run db:generate` writes SQL to ./migrations.
 * `bun run db:migrate` applies it to the remote D1 database through wrangler,
 * `bun run db:migrate:local` against the local miniflare copy.
 *
 * The `d1-http` credentials below are only needed for `drizzle-kit studio`.
 */
export default defineConfig({
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
  dialect: 'sqlite',
  driver: 'd1-http',
  out: './migrations',
  schema: './lib/db/schema.ts',
});
