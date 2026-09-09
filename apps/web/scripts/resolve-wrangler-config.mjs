/**
 * Resolves the Wrangler config used for a non-interactive build/deploy.
 *
 * `wrangler.jsonc` is committed with REPLACE_WITH_… placeholders because the D1
 * and KV ids are account-specific and do not belong in a public repository. CI
 * — Workers Builds or a GitHub Actions job — supplies them as build environment
 * variables instead, and this writes a resolved copy that the Cloudflare Vite
 * plugin builds from. The bindings have to be correct at *build* time: the
 * plugin bakes them into `dist/server/wrangler.json`, which is what
 * `wrangler deploy` and `wrangler versions upload` actually upload.
 *
 * With none of the variables set — the normal local case, where you have pasted
 * your own ids into `wrangler.jsonc` — this is a no-op and the committed file is
 * used unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_CONFIG = path.join(projectRoot, 'wrangler.jsonc');
const RESOLVED_CONFIG = path.join(projectRoot, 'wrangler.generated.jsonc');

/** Placeholder token in wrangler.jsonc → environment variable that fills it. */
const SUBSTITUTIONS = {
  REPLACE_WITH_YOUR_APP_CACHE_KV_ID: 'CLOUDFLARE_KV_APP_CACHE_ID',
  REPLACE_WITH_YOUR_D1_DATABASE_ID: 'CLOUDFLARE_D1_DATABASE_ID',
  REPLACE_WITH_YOUR_VINEXT_CACHE_KV_ID: 'CLOUDFLARE_KV_VINEXT_CACHE_ID',
};

/** Placeholder token → the resource whose id it stands in for. */
const RESOURCES = {
  REPLACE_WITH_YOUR_APP_CACHE_KV_ID: 'KV namespace APP_CACHE',
  REPLACE_WITH_YOUR_D1_DATABASE_ID: 'D1 database "lobehub"',
  REPLACE_WITH_YOUR_VINEXT_CACHE_KV_ID: 'KV namespace VINEXT_CACHE',
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined} path to the resolved config, or undefined when
 *   no substitution applied and the committed config should be used as-is.
 */
export function resolveWranglerConfig(env = process.env) {
  const source = readFileSync(SOURCE_CONFIG, 'utf8');

  // Plain token replacement rather than a JSONC parse/serialize round-trip, so
  // the comments explaining every binding survive into the generated file.
  let resolved = source;
  for (const [token, variable] of Object.entries(SUBSTITUTIONS)) {
    const value = env[variable];
    if (value) resolved = resolved.replaceAll(token, value);
  }

  if (resolved === source) return undefined;

  writeFileSync(RESOLVED_CONFIG, resolved);
  return RESOLVED_CONFIG;
}

/**
 * Bindings whose id is still a placeholder once the environment has had its
 * say. The build itself succeeds — the ids are only strings to Vite — but the
 * upload fails against the API, far from the cause, so the build warns first.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]} human-readable descriptions, empty when everything resolves
 */
export function unresolvedBindingIds(env = process.env) {
  const source = readFileSync(SOURCE_CONFIG, 'utf8');

  return Object.entries(SUBSTITUTIONS)
    .filter(([token, variable]) => source.includes(token) && !env[variable])
    .map(
      ([token, variable]) =>
        `${RESOURCES[token]} — set ${variable}, or paste the id into wrangler.jsonc`,
    );
}

/** Prints {@link unresolvedBindingIds} as a build warning. */
export function warnUnresolvedBindingIds(env = process.env) {
  const unresolved = unresolvedBindingIds(env);
  if (unresolved.length === 0) return;

  console.warn(
    [
      '',
      'wrangler.jsonc still carries placeholder binding ids:',
      ...unresolved.map((line) => `  • ${line}`),
      'The build will finish, but `wrangler deploy` / `versions upload` will be',
      'rejected by the API. See apps/web/README.md → "Binding ids in CI".',
      '',
    ].join('\n'),
  );
}

// `node scripts/resolve-wrangler-config.mjs` prints the config path to use, so
// one-off commands can pass it through: wrangler d1 migrations apply -c "$(…)"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(resolveWranglerConfig() ?? SOURCE_CONFIG);
}
