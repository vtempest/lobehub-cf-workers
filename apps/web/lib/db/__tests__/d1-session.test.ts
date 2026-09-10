/**
 * @vitest-environment node
 *
 * Worker-side code, and the root `vitest.config.mts` would otherwise run this
 * file under happy-dom: there `cookie` is a forbidden header name, so
 * `new Request(url, { headers: { cookie } })` silently drops it and the
 * cookie-bookmark case below can never pass. `apps/web/vitest.config.ts`
 * already runs on Node; this directive makes the root config agree.
 */
import { describe, expect, it } from 'vitest';

import {
  applyD1Bookmark,
  D1_BOOKMARK_COOKIE,
  D1_BOOKMARK_HEADER,
  FIRST_PRIMARY,
  FIRST_UNCONSTRAINED,
  getD1Bookmark,
  runWithD1Session,
  sessionedD1,
} from '../d1-session';

/** The slice of the D1 statement surface the wrapper touches. */
interface FakeStatement {
  all(): Promise<{ meta: { served_by_primary: boolean; served_by_region: string } }>;
  bind(...values: unknown[]): FakeStatement;
  first(): Promise<null>;
  raw(): Promise<unknown[]>;
  run(): Promise<{ meta: Record<string, never> }>;
}

interface FakeBinding {
  batch(statements: FakeStatement[]): Promise<unknown[]>;
  prepare(sql: string): FakeStatement;
  withSession(constraint?: string): {
    batch(statements: FakeStatement[]): Promise<unknown[]>;
    getBookmark(): string | null;
    prepare(sql: string): FakeStatement;
  };
}

/**
 * Minimal stand-in for the D1 binding: records which constraint each session
 * was opened with, and whether each statement ran on the session or straight
 * on the binding.
 */
function fakeBinding(bookmark: string | null = 'bm-2') {
  const opened: string[] = [];
  const queries: { on: 'binding' | 'session'; sql: string }[] = [];

  const statement = (sql: string, on: 'binding' | 'session'): FakeStatement => {
    const self: FakeStatement = {
      all: async () => {
        queries.push({ on, sql });
        return { meta: { served_by_primary: on === 'binding', served_by_region: 'weur' } };
      },
      bind: () => self,
      first: async () => null,
      raw: async () => [],
      run: async () => {
        queries.push({ on, sql });
        return { meta: {} };
      },
    };
    return self;
  };

  const binding: FakeBinding = {
    batch: async (statements) => Promise.all(statements.map((s) => s.all())),
    prepare: (sql) => statement(sql, 'binding'),
    withSession(constraint) {
      opened.push(constraint ?? '<none>');
      return {
        batch: async (statements) => Promise.all(statements.map((s) => s.all())),
        getBookmark: () => bookmark,
        prepare: (sql) => statement(sql, 'session'),
      };
    },
  };

  return { binding, opened, queries };
}

const request = (url: string, init?: RequestInit) => new Request(url, init);

describe('runWithD1Session', () => {
  it('starts a read with no bookmark on any replica', async () => {
    const { binding, opened } = fakeBinding();
    await runWithD1Session(request('https://app.test/chat'), 'auto', async () => {
      await sessionedD1(binding).prepare('select 1').all();
    });
    expect(opened).toEqual([FIRST_UNCONSTRAINED]);
  });

  it('starts a write with no bookmark on the primary', async () => {
    const { binding, opened } = fakeBinding();
    await runWithD1Session(request('https://app.test/api/agents', { method: 'POST' }), 'auto', async () => {
      await sessionedD1(binding).prepare('insert into agents').run();
    });
    expect(opened).toEqual([FIRST_PRIMARY]);
  });

  it('resumes from the client bookmark when one is supplied', async () => {
    const { binding, opened } = fakeBinding();
    await runWithD1Session(
      request('https://app.test/chat', { headers: { [D1_BOOKMARK_HEADER]: 'bm-1' } }),
      'auto',
      async () => {
        await sessionedD1(binding).prepare('select 1').all();
      },
    );
    expect(opened).toEqual(['bm-1']);
  });

  it('reads the bookmark from the cookie as well as the header', async () => {
    const { binding, opened } = fakeBinding();
    await runWithD1Session(
      request('https://app.test/chat', {
        headers: { cookie: `other=x; ${D1_BOOKMARK_COOKIE}=bm-cookie` },
      }),
      'auto',
      async () => {
        await sessionedD1(binding).prepare('select 1').all();
      },
    );
    expect(opened).toEqual(['bm-cookie']);
  });

  it('rejects a malformed client bookmark rather than passing it to D1', async () => {
    const { binding, opened } = fakeBinding();
    await runWithD1Session(
      request('https://app.test/chat', { headers: { [D1_BOOKMARK_HEADER]: 'not a bookmark!' } }),
      'auto',
      async () => {
        await sessionedD1(binding).prepare('select 1').all();
      },
    );
    expect(opened).toEqual([FIRST_UNCONSTRAINED]);
  });

  it('pins auth reads to the primary even with a bookmark or the unconstrained override', async () => {
    for (const mode of ['auto', 'unconstrained']) {
      const { binding, opened } = fakeBinding();
      await runWithD1Session(
        request('https://app.test/api/auth/callback/google', {
          headers: { [D1_BOOKMARK_HEADER]: 'bm-1' },
        }),
        mode,
        async () => {
          await sessionedD1(binding).prepare('select 1').all();
        },
      );
      expect(opened, `mode=${mode}`).toEqual([FIRST_PRIMARY]);
    }
  });

  it('bypasses the Sessions API entirely when the mode is off', async () => {
    const { binding, opened, queries } = fakeBinding();
    await runWithD1Session(request('https://app.test/chat'), 'off', async () => {
      await sessionedD1(binding).prepare('select 1').all();
    });
    expect(opened).toEqual([]);
    expect(queries).toEqual([{ on: 'binding', sql: 'select 1' }]);
  });

  it('shares one session across every query in the request', async () => {
    const { binding, opened } = fakeBinding();
    const db = sessionedD1(binding);
    await runWithD1Session(request('https://app.test/chat'), 'auto', async () => {
      await db.prepare('select 1').all();
      await db.prepare('select 2').bind(1).all();
      await db.batch([db.prepare('select 3')]);
    });
    expect(opened).toHaveLength(1);
  });

  it('passes through unchanged outside a session scope', async () => {
    const { binding, opened, queries } = fakeBinding();
    await sessionedD1(binding).prepare('select 1').all();
    expect(opened).toEqual([]);
    expect(queries).toEqual([{ on: 'binding', sql: 'select 1' }]);
  });
});

describe('applyD1Bookmark', () => {
  it('returns the closing bookmark as both a header and a cookie', async () => {
    const { binding } = fakeBinding('bm-9');
    const response = await runWithD1Session(request('https://app.test/chat'), 'auto', async () => {
      await sessionedD1(binding).prepare('select 1').all();
      return applyD1Bookmark(new Response('ok'));
    });

    expect(response.headers.get(D1_BOOKMARK_HEADER)).toBe('bm-9');
    expect(response.headers.get('set-cookie')).toContain(`${D1_BOOKMARK_COOKIE}=bm-9`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('leaves a response alone when the request never touched D1', async () => {
    const response = await runWithD1Session(request('https://app.test/logo.svg'), 'auto', async () =>
      applyD1Bookmark(new Response('ok')),
    );
    expect(response.headers.get(D1_BOOKMARK_HEADER)).toBeNull();
    // No Set-Cookie, so static and otherwise cacheable responses stay cacheable.
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('adds replica diagnostics only when asked', async () => {
    const { binding } = fakeBinding('bm-9');
    const response = await runWithD1Session(request('https://app.test/chat'), 'auto', async () => {
      await sessionedD1(binding).prepare('select 1').all();
      return applyD1Bookmark(new Response('ok'), { debug: true });
    });
    expect(response.headers.get('x-d1-served-by-region')).toBe('weur');
    expect(response.headers.get('x-d1-served-by-primary')).toBe('false');
  });

  it('has no bookmark outside a session scope', () => {
    expect(getD1Bookmark()).toBeNull();
  });
});
