// @vitest-environment node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveWranglerConfig, unresolvedBindingIds } from './resolve-wrangler-config.mjs';

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

    // The two bindings are separate namespaces; a shared placeholder would have
    // pointed the ISR cache and the app cache at the same KV store.
    const config = readFileSync(resolved, 'utf8');
    expect(config).toContain('"id": "vinext-cache-id"');
    expect(config).toContain('"id": "app-cache-id"');
    expect(config).not.toContain('REPLACE_WITH_YOUR_VINEXT_CACHE_KV_ID');
    expect(config).not.toContain('REPLACE_WITH_YOUR_APP_CACHE_KV_ID');
  });

  it('substitutes the D1 database id independently of the KV ids', () => {
    const config = readFileSync(
      resolveWranglerConfig({ CLOUDFLARE_D1_DATABASE_ID: 'd1-id' }),
      'utf8',
    );

    expect(config).toContain('"database_id": "d1-id"');
    expect(config).toContain('REPLACE_WITH_YOUR_VINEXT_CACHE_KV_ID');
  });
});

describe('unresolvedBindingIds', () => {
  it('names every binding whose id neither the config nor the environment supplies', () => {
    const unresolved = unresolvedBindingIds({});

    expect(unresolved).toHaveLength(3);
    expect(unresolved.join('\n')).toContain('D1 database "lobehub"');
    expect(unresolved.join('\n')).toContain('CLOUDFLARE_KV_VINEXT_CACHE_ID');
  });

  it('counts an id supplied by the environment as resolved', () => {
    const unresolved = unresolvedBindingIds({ CLOUDFLARE_D1_DATABASE_ID: 'd1-id' });

    expect(unresolved).toHaveLength(2);
    expect(unresolved.join('\n')).not.toContain('D1 database');
  });
});
