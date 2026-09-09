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
`lib/cf/bindings.ts`, wires the KV-backed ISR cache, handles image optimization,
and hands everything else to vinext's App Router runtime. Because bindings are
constant per isolate, any server module can call `getBindings()` without `env`
being threaded through it.

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
lib/db/              Drizzle schema + D1 client
lib/ai/              Model catalog + Workers AI client
lib/email/           MIME builder, templates, send_email binding
lib/chat/            Repository, stream protocol, title generation
migrations/          D1 migrations (drizzle-kit)
worker/index.ts      Worker entry
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

### Cloudflare Workers Builds

Workers Builds reads the Node version from `.nvmrc`, and its tool installer only
accepts an exact version — an nvm alias such as `lts/krypton` fails at
`Installing nodejs` before a single dependency is fetched. The repo root and
`apps/web` both pin `24.20.0` (the current Krypton LTS release); keep the two in
sync when bumping, or override them with a `NODE_VERSION` build variable in the
project settings.

Project settings for a build of this app:

| Setting | Value |
| --- | --- |
| Root directory | `apps/web` |
| Build command | `pnpm run build` |
| Deploy command | `pnpm exec wrangler deploy` |

## Commands

```bash
bun run dev              # vinext dev (miniflare bindings)
bun run build            # build the Worker + client assets
bun run preview          # build, then serve with wrangler dev
bun run deploy           # build and deploy
bun run typecheck        # tsc --noEmit
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
