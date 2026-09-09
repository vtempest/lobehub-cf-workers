// @vitest-environment node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveWranglerConfig, staleSubstitutions } from './resolve-wrangler-config.mjs';

const generated = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'wrangler.generated.jsonc',
);

afterEach(() => {
  rmSync(generated, { force: true });
});

describe('resolveWranglerConfig', () => {
  it('leaves the committed config in place when no ids are supplied', () => {
    expect(resolveWranglerConfig({})).toBeUndefined();
    expect(existsSync(generated)).toBe(false);
  });

  it('gives VINEXT_CACHE and APP_CACHE their own namespace ids', () => {
    const resolved = resolveWranglerConfig({
      CLOUDFLARE_KV_APP_CACHE_ID: 'app-cache-id',
      CLOUDFLARE_KV_VINEXT_CACHE_ID: 'vinext-cache-id',
    });

    expect(resolved).toBe(generated);

    // The two bindings are separate namespaces; overriding one must not move
    // the other, or the ISR cache and the app cache share a KV store.
    const config = readFileSync(resolved, 'utf8');
    expect(config).toContain('"id": "vinext-cache-id"');
    expect(config).toContain('"id": "app-cache-id"');
  });

  it('substitutes the D1 database id independently of the KV ids', () => {
    const config = readFileSync(
      resolveWranglerConfig({ CLOUDFLARE_D1_DATABASE_ID: 'd1-id' }),
      'utf8',
    );

    expect(config).toContain('"database_id": "d1-id"');
    expect(config).toContain('"binding": "VINEXT_CACHE"');
    expect(config).not.toContain('"id": "d1-id"');
  });
});

describe('staleSubstitutions', () => {
  // A re-created database or namespace changes the id in wrangler.jsonc; if the
  // substitution table is not updated with it, the CI override quietly becomes
  // a no-op and the build deploys against the wrong account's resources.
  it('finds no override pointing at an id wrangler.jsonc no longer contains', () => {
    expect(staleSubstitutions()).toEqual([]);
  });
});
