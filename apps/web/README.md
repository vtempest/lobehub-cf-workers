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

The D1 database, both KV namespaces and the R2 bucket already exist in this
project's Cloudflare account, and `wrangler.jsonc` names them — so steps 1 and 2
are only for a fork or a second account.

```bash
pnpm install

# 1. Create the Cloudflare resources
bunx wrangler d1 create lobehub
bunx wrangler kv namespace create VINEXT_CACHE
bunx wrangler kv namespace create APP_CACHE
bunx wrangler r2 bucket create lobehub-files

# 2. Paste the returned ids into wrangler.jsonc, over the ones committed there.
#    In CI, override them with environment variables instead — see
#    "Binding ids in CI".

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

### Cloudflare Workers Builds

Workers Builds reads the Node version from `.nvmrc`, and its tool installer only
accepts an exact version — an nvm alias such as `lts/krypton` fails at
`Installing nodejs` before a single dependency is fetched. The repo root and
`apps/web` both pin `24.20.0` (the current Krypton LTS release); keep the two in
sync when bumping, or override them with a `NODE_VERSION` build variable in the
project settings.

The build settings themselves are under [Deploying → Workers
Builds](#workers-builds).

## Commands

```bash
bun run dev              # vinext dev (miniflare bindings)
bun run build            # build the Worker + client assets
bun run preview          # build, then serve with wrangler dev
bun run deploy           # build and deploy
bun run upload           # build and upload a version without deploying it
bun run cf:deploy        # deploy an already-built dist/ (no build step)
bun run cf:upload        # upload an already-built dist/ as a version
bun run typecheck        # tsc --noEmit
bun run test             # vitest run (lib/ unit tests)
bun run check            # typecheck + tests
bun run db:generate      # regenerate migrations from lib/db/schema.ts
bun run cf:typegen       # regenerate worker binding types from wrangler.jsonc
```

Each has a passthrough at the repository root (`bun run web:dev`,
`web:build`, `web:deploy`, `web:upload`, `web:preview`, `web:db:migrate`), so
CI never has to `cd` into this directory. `web:cf:build` additionally installs
this app's dependencies — see [Workers Builds](#workers-builds).

## Deploying

This app is a Worker **built by Vite**, not a directory of static files. Its
`wrangler.jsonc` declares `main` and an `ASSETS` binding, but the assets
directory is filled in at build time by `@cloudflare/vite-plugin`, which writes
`dist/server/wrangler.json` — the config that is actually uploaded — plus a
`.wrangler/deploy/config.json` redirect pointing at it. **Wrangler therefore has
to run after a build**: with no `dist/`, there is nothing to deploy.

Wrangler finds that config by walking up from its working directory. `apps/web`
gets the redirect from the build; the repository root has a committed one
([`.wrangler/deploy/config.json`](../../.wrangler/deploy/config.json)) naming
the same file, so a build followed by a bare `wrangler deploy` or `wrangler
versions upload` works from either place. Without a build, both report:

```text
✘ [ERROR] Missing entry-point to Worker script or to assets directory
```

Nothing further up such a log — peer-dependency warnings, blocked postinstalls,
`npm warn Unknown project config` — is related; the `npm warn` lines only mean
`npx` was used in a repository configured for pnpm.

### Workers Builds

In **Workers & Pages → your Worker → Settings → Build**. Either layout works;
the first is what this app is meant to use.

**Root directory `apps/web`** — installs this app's dependencies only (~15s)
and leaves both deploy commands at their defaults:

| Setting | Value |
| --- | --- |
| Root directory | `apps/web` |
| Build command | `bun run build` |
| Deploy command | `npx wrangler deploy` *(default)* |
| Non-production branch deploy command | `npx wrangler versions upload` *(default)* |

**Root directory at the repository root** — needs a build command that installs
this app first, because the root `bun install` does not reach it: the root
`package.json` `workspaces` array (what bun reads) does not list `apps/web`,
only `pnpm-workspace.yaml` does.

| Setting | Value |
| --- | --- |
| Root directory | *(empty)* |
| Build command | `bun run web:cf:build` |
| Deploy command | `npx wrangler deploy` *(default)* |
| Non-production branch deploy command | `npx wrangler versions upload` *(default)* |

`web:cf:build` is `cd apps/web && bun install && bun run build`. The monorepo
passthrough `bun run web:build` assumes the dependencies are already there, so
it is the wrong build command for a fresh CI container.

What cannot work either way is leaving the **build command empty**: the deploy
commands do not build, and every step after the missing `dist/` fails.

### Binding ids in CI

`wrangler.jsonc` carries the real D1 and KV ids. A resource id is not a
credential — it is inert without an API token — so it is committed, the way
Wrangler configs normally are, and a build needs no variables at all.

To build against a **different** account without editing the file, override
them:

| Variable | Replaces |
| --- | --- |
| `CLOUDFLARE_D1_DATABASE_ID` | `d1_databases[DB].database_id` |
| `CLOUDFLARE_KV_VINEXT_CACHE_ID` | `kv_namespaces[VINEXT_CACHE].id` |
| `CLOUDFLARE_KV_APP_CACHE_ID` | `kv_namespaces[APP_CACHE].id` |

`scripts/resolve-wrangler-config.mjs` substitutes them into a gitignored
`wrangler.generated.jsonc` that `vite.config.ts` builds from. With none set it
is a no-op. The ids have to be right at *build* time, not deploy time — the Vite
plugin bakes the bindings into `dist/server/wrangler.json`, and that is what
gets uploaded. Re-creating a resource therefore means changing the id in *both*
`wrangler.jsonc` and that script's substitution table; a test fails if they
drift apart.

Bindings the account does not back are rejected at upload rather than at
runtime: `send_email` needs an Email Routing zone and `images` needs Cloudflare
Images — drop either block if yours has neither.

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
