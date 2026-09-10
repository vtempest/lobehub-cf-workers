/**
 * Resolves the Wrangler config used for a non-interactive build/deploy.
 *
 * `wrangler.jsonc` carries the D1 and KV ids of this project's own Cloudflare
 * account. Building the same app against a *different* account — a fork, a
 * staging account — would otherwise mean editing a committed file, so CI can
 * name its own resources through environment variables instead, and this writes
 * a resolved copy that the Cloudflare Vite plugin builds from. The bindings
 * have to be correct at *build* time: the plugin bakes them into
 * `dist/server/wrangler.json`, which is what `wrangler deploy` and `wrangler
 * versions upload` actually upload.
 *
 * With none of the variables set — the normal case — this is a no-op and the
 * committed file is used unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_CONFIG = path.join(projectRoot, 'wrangler.jsonc');
const RESOLVED_CONFIG = path.join(projectRoot, 'wrangler.generated.jsonc');

/**
 * Committed id in wrangler.jsonc → environment variable that replaces it.
 * Keep the left-hand side in step with `wrangler.jsonc`: an id that is no
 * longer in the file is inert rather than wrong, so `resolveWranglerConfig()`
 * warns about it at build time.
 */
const SUBSTITUTIONS = {
  '059ea054-f709-4b4b-bb6e-dc25dc841ed5': 'CLOUDFLARE_D1_DATABASE_ID',
  '7ca5e606272b4de5afcd5ee466d2cd34': 'CLOUDFLARE_KV_APP_CACHE_ID',
  cbaa860dd2894dc9ae496f290cc60d3d: 'CLOUDFLARE_KV_VINEXT_CACHE_ID',
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined} path to the resolved config, or undefined when
 *   no substitution applied and the committed config should be used as-is.
 */
export function resolveWranglerConfig(env = process.env) {
  const source = readFileSync(SOURCE_CONFIG, 'utf8');

  const stale = staleSubstitutions(source);
  if (stale.length > 0) {
    console.warn(
      `[wrangler] substitution table is out of date with wrangler.jsonc; these overrides no longer apply: ${stale.join(', ')}`,
    );
  }

  // Plain token replacement rather than a JSONC parse/serialize round-trip, so
  // the comments explaining every binding survive into the generated file.
  let resolved = source;
  for (const [id, variable] of Object.entries(SUBSTITUTIONS)) {
    const value = env[variable];
    if (value) resolved = resolved.replaceAll(id, value);
  }

  if (resolved === source) return undefined;

  writeFileSync(RESOLVED_CONFIG, resolved);
  return RESOLVED_CONFIG;
}

/**
 * Ids this module claims to substitute that `wrangler.jsonc` no longer
 * contains — a re-created resource whose override would silently stop working.
 *
 * @param {string} [source] contents of `wrangler.jsonc`, read when omitted
 * @returns {string[]} environment variables whose target id is missing, empty
 *   when the two files are in step
 */
export function staleSubstitutions(source = readFileSync(SOURCE_CONFIG, 'utf8')) {
  return Object.entries(SUBSTITUTIONS)
    .filter(([id]) => !source.includes(id))
    .map(([, variable]) => variable);
}

// `node scripts/resolve-wrangler-config.mjs` prints the config path to use, so
// one-off commands can pass it through: wrangler d1 migrations apply -c "$(…)"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(resolveWranglerConfig() ?? SOURCE_CONFIG);
}
