# @lobehub/web — LobeHub on Cloudflare Workers

The LobeHub web app, built on the `template-vinext` starter and rewritten so that
**every backend capability is a Cloudflare binding**. There is no Postgres, no
hosted email API, and no third-party inference provider in the request path.

| Capability | Cloudflare service | Binding | Code |
| --- | --- | --- | --- |
| Database | D1 (SQLite) | `DB` | `lib/db/` |
| Inference + embeddings | Workers AI (optionally via AI Gateway) | `AI` | `lib/ai/` |
| Transactional email | Email Routing | `SEND_EMAIL` | `lib/email/` |
| File storage | R2 | `FILES` | `lib/storage/r2.ts` |
| Cache + rate limits | Workers KV | `APP_CACHE` | `lib/cache/kv.ts` |
| ISR / fragment cache | Workers KV | `VINEXT_CACHE` | `worker/index.ts` |
| Image optimization | Cloudflare Images | `IMAGES` | `worker/index.ts` |
| Static assets | Workers Assets | `ASSETS` | `wrangler.jsonc` |
| Semantic search (optional) | Vectorize | `VECTORIZE` | commented in `wrangler.jsonc` |

The one deliberate exception is **Stripe**, used for billing because Cloudflare
has no equivalent. It is entirely optional: with no `STRIPE_SECRET_KEY` set, the
billing endpoints fail with an explanatory error and nothing else is affected.

## Architecture

`worker/index.ts` is the only entry point. On each request it publishes `env` to
`lib/cf/bindings.ts`, opens a D1 session, wires the KV-backed ISR cache, handles
image optimization, and hands everything else to vinext's App Router runtime.
Because bindings are constant per isolate, any server module can call
`getBindings()` without `env` being threaded through it.

```
app/                 App Router pages and API routes
  api/chat           SSE streaming chat turn (Workers AI → D1)
  api/conversations  Thread CRUD
  api/agents         Agent CRUD
  api/models         Workers AI model catalog
  api/files          R2 upload / download / delete
  chat/              Chat UI (list + transcript + composer)
components/chat/     Chat components
hooks/               use-chat-stream — client for the SSE protocol
lib/cf/bindings.ts   Typed binding accessor
lib/db/              Drizzle schema + D1 client + Sessions-API wrapper
lib/ai/              Model catalog + Workers AI client
lib/email/           MIME builder, templates, send_email binding
lib/chat/            Repository, stream protocol, title generation
migrations/          D1 migrations (drizzle-kit)
worker/index.ts      Worker entry
```

### D1 read replication

Data access uses the same architecture as QwkSearch: `lib/db/d1-session.ts` is a
port of that app's module and is kept behaviourally identical, so a fix in one
belongs in the other.

With read replication enabled, D1 answers reads from a replica near the request
rather than from the single primary — the win is round trips, not query time. A
replica can lag, so every request runs inside one *session*: queries carry a
bookmark, and D1 only serves the session a version at least as new as everything
it has already seen. One request therefore gets one consistent view of the
database no matter which replica answers.

```
worker/index.ts        runWithD1Session(request, env.D1_SESSION_MODE, …)
  lib/db/index.ts        drizzle(sessionedD1(env.DB))   ← every query in the request
worker/index.ts        applyD1Bookmark(response)        → x-d1-bookmark + d1_bookmark cookie
```

The client hands the closing bookmark back on its next request (header for API
clients, cookie for navigations), so reads never go backwards. `/api/auth/*` is
the exception and always starts on the primary: OAuth state and magic-link
tokens are written by one request and read by a different one seconds later,
often with no bookmark to resume from, and a lagging replica turns that into a
failed sign-in rather than a stale render.

`D1_SESSION_MODE` (a plain var, changeable from the dashboard without a
redeploy) tunes this: `auto` (default), `primary`, `unconstrained`, or `off` to
bypass the Sessions API entirely as a rollback switch. Set `D1_SESSION_DEBUG=1`
to have responses carry `x-d1-served-by-region` and `x-d1-served-by-primary`.

The Sessions API is a no-op on a database with replication turned off, so all of
this is safe to deploy before — and independently of — enabling it:

```bash
bunx wrangler d1 read-replication enable lobehub
```

### Chat streaming

`POST /api/chat` speaks a small purpose-built SSE protocol
(`lib/chat/stream-protocol.ts`) rather than a vendor chat-SDK format: the server
is Workers AI end to end, so there is no upstream shape to mirror, and owning
the frames keeps the client hook dependency-free.

```
data: {"type":"start","conversationId":…,"userMessageId":…,"assistantMessageId":…}
data: {"type":"delta","text":"…"}
data: {"type":"title","title":"…"}      // first turn of a new thread only
data: {"type":"done","content":"…"}
data: {"type":"error","message":"…"}
```

A failed generation is persisted as an assistant row carrying `error`, so a
reload shows what happened instead of silently losing the turn.

## Setup

```bash
pnpm install

# 1. Create the Cloudflare resources
bunx wrangler d1 create lobehub
bunx wrangler kv namespace create VINEXT_CACHE
bunx wrangler kv namespace create APP_CACHE
bunx wrangler r2 bucket create lobehub-files

# 2. Paste the returned ids into wrangler.jsonc (replace the REPLACE_WITH_… placeholders)

# 3. Apply the schema
bun run db:migrate:local   # local miniflare copy
bun run db:migrate         # remote D1

# 4. Secrets
bunx wrangler secret put BETTER_AUTH_SECRET      # openssl rand -base64 32
bunx wrangler secret put GOOGLE_CLIENT_SECRET    # optional
bunx wrangler secret put STRIPE_SECRET_KEY       # optional, billing only
```

### Email

`send_email` requires Email Routing enabled on the sender's zone, and it
delivers only to addresses verified as destinations in the same Cloudflare
account. Set `NEXT_PUBLIC_APP_EMAIL` to a sender on that zone.

Without the binding — local dev, or an account with no Email Routing zone —
`lib/email/send.ts` logs the message and returns `{ delivered: false, reason }`
instead of throwing, so sign-in and invitations stay testable offline. Callers
surface that outcome rather than swallowing it. If your account has no Email
Routing zone, delete the `send_email` block from `wrangler.jsonc` or `wrangler
deploy` will reject the config.

## Commands

```bash
bun run dev              # vinext dev (miniflare bindings)
bun run build            # build the Worker + client assets
bun run preview          # build, then serve with wrangler dev
bun run deploy           # build and deploy
bun run typecheck        # tsc --noEmit
bun run test             # vitest run (lib/ unit tests)
bun run check            # typecheck + tests
bun run db:generate      # regenerate migrations from lib/db/schema.ts
bun run cf:typegen       # regenerate worker binding types from wrangler.jsonc
```

## Notes on what was removed from the starter

The template carried a broad set of provider SDKs; the ones with a Cloudflare
equivalent were dropped rather than left as dead configuration.

- **Data**: `@libsql/client` / Turso, `pg`, `postgres`, `@neondatabase/serverless`,
  `mysql2`, `mongodb`, `prisma`, `@planetscale/database`, `@xata.io/client`,
  `@vercel/postgres`, `kysely`, `knex` → **D1 + Drizzle**.
- **Email**: `resend` → **Email Routing**.
- **Inference**: `@langchain/groq`, `@langchain/openai`, `langchain` → **Workers AI**.
- **Analytics**: `@vercel/analytics` → Cloudflare Web Analytics (zero-code, enabled
  from the dashboard).
- **Wallet auth**: `siwe`, `ethers`, and the SIWE sign-in button — replaced by
  email magic-link sign-in, which the Email Routing binding now makes possible.
- **Bundle weight**: `three` / `@react-three/*` / `three-globe` decorative
  components, `recharts` (with the unused `ui/chart` component), and `mermaid`.
  Mermaid alone accounted for ~40% of the Worker upload (3.08 MB → 1.79 MB
  gzipped, against Cloudflare's 3 MB free-plan limit). To restore it, add the
  dependency back and re-register a `Mermaid` component in `mdx-components.tsx`.
- **Docs tooling**: `fumadocs-twoslash` and `fumadocs-typescript`, which pull the
  TypeScript compiler into the build graph.
