/**
 * Drizzle client for the D1 database.
 *
 * The `DB` binding is routed through `sessionedD1()` so that, with read
 * replication enabled, every query in a request shares one D1 session and
 * therefore one sequentially consistent view of the database — see
 * ./d1-session.ts. Outside a session scope it is a pass-through, so this is
 * safe whether or not replication is switched on for the database.
 *
 * The client is cached per binding rather than per request: bindings are
 * constant for the life of an isolate, and `sessionedD1()` resolves the session
 * on each call rather than at construction, so a cached drizzle instance still
 * gives every request its own session.
 */
import { drizzle } from 'drizzle-orm/d1';

import { getBindings } from '../cf/bindings';
import { sessionedD1 } from './d1-session';
import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: { binding: D1Database; client: Database } | null = null;
/** Set only by tests; takes precedence over the binding-derived client. */
let override: Database | null = null;

/**
 * The drizzle client for this request.
 *
 * Throws when there is no `DB` binding — a deployment mistake worth failing
 * loudly on rather than degrading to a datastore that silently loses writes.
 */
export function getDb(): Database {
  if (override) return override;

  const binding = getBindings().DB;
  if (!binding) {
    throw new Error(
      'D1 is not bound. Add a `d1_databases` entry with binding `DB` to wrangler.jsonc.',
    );
  }

  if (cached?.binding !== binding) {
    cached = { binding, client: drizzle(sessionedD1(binding), { schema }) };
  }
  return cached.client;
}

/**
 * The same client as a property-access proxy, for the `db.query.…` /
 * `db.select()` call style used across the API routes. Resolution is deferred
 * to first use, so importing this module outside a request (a build step, a
 * module graph walk) does not require a binding.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const value = Reflect.get(getDb() as object, property);
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
  has(_target, property) {
    return Reflect.has(getDb() as object, property);
  },
}) as Database;

/** Test hook: install a stub client, or restore the real one with `null`. */
export function __setDbForTests(client: Database | null): void {
  override = client;
  cached = null;
}

export { schema };
