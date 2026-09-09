import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests for the server-side modules under `lib/`.
 *
 * Deliberately separate from vite.config.ts: that config loads the Cloudflare
 * and fumadocs plugins to build the Worker, none of which a unit test needs.
 */
export default defineConfig({
  resolve: {
    alias: { '@': __dirname },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
