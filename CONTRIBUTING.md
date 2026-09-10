# Contributing to LobeHub

Thanks for your interest in contributing! We welcome bug reports, documentation improvements, feature ideas, and pull requests.

LobeHub is a Next.js 16 + React 19 monorepo with a `react-router-dom` SPA inside it, backed by a Hono server, Drizzle ORM and PostgreSQL, and shipped to web, desktop (Electron) and CLI.

## Before You Start

- Read the [README](README.md), [AGENTS.md](AGENTS.md) — the repository's architecture and workflow guide — and [DESIGN.md](DESIGN.md) for the design values that user-facing work is held to.
- Search [existing issues](https://github.com/vtempest/lobehub-cf-workers/issues) and [pull requests](https://github.com/vtempest/lobehub-cf-workers/pulls) to avoid duplicating work.
- For substantial changes — new routes, database schema changes, a new builtin tool, or changes to the agent runtime — open an issue first to discuss the problem, proposed approach, and scope.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For security issues, **do not open a public issue** — follow [SECURITY.md](SECURITY.md).

## Reporting Bugs

Please open an issue using the [bug report template](.github/ISSUE_TEMPLATE/1_bug_report.yml) and include:

- A clear, descriptive title
- What you expected to happen
- What actually happened
- Steps to reproduce the problem
- Minimal reproducible code or repository, when possible
- Relevant logs, error messages, screenshots, and environment details

Environment details should include the version or commit, deployment mode (web, Docker, desktop), operating system, `node --version`, `pnpm --version`, and browser version when relevant. **Redact API keys, database URLs, and auth secrets before pasting logs.**

## Suggesting Features

Feature requests are welcome — use the [feature request template](.github/ISSUE_TEMPLATE/2_feature_request.yml) and explain:

- The problem or use case
- Your proposed solution
- Alternatives you considered
- Any compatibility, performance, security, or maintenance tradeoffs

Avoid starting a large implementation before maintainers have had a chance to comment on the proposal.

## Development Setup

The fastest way to get the project running is [`git0`](https://www.npmjs.com/package/git0) — it downloads the repo, detects the project type, installs dependencies, and opens your editor in one step:

```bash
npx git0 vtempest/lobehub-cf-workers
```

`git0` downloads a source snapshot without `.git` history, which is ideal for trying the project out. To submit a pull request you need a real git clone of your own fork:

1. Fork the repository and clone your fork.
2. Create a branch from `canary` — **not** `main`. `canary` is the development branch; `main` is the release branch.
3. Install dependencies with pnpm.
4. Run the project locally and confirm the checks pass.

```bash
git clone https://github.com/YOUR-USERNAME/lobehub-cf-workers.git
cd lobehub-cf-workers
git checkout -b feat/short-description

pnpm install         # pnpm for dependencies
bun run dev:spa      # frontend only, proxies API to localhost:3010
```

The repo uses **pnpm** for dependency management, **bun** to run npm scripts, and **bunx** for executable npm packages.

Other entry points:

```bash
bun run dev                            # full stack (Next.js + Vite SPA)
pnpm --filter @lobechat/server dev     # standalone Hono backend
bun run dev:docker                     # postgres, redis, rustfs, searxng
bun run db:migrate                     # apply database migrations
```

After `dev:spa` starts, the terminal prints a **Debug Proxy** URL. Opening it loads your local Vite dev server's SPA inside the production environment, so you get HMR against real server config.

## Making Changes

- Keep changes focused; avoid unrelated refactors in the same pull request.
- Match the existing code style, naming conventions, and project architecture. `AGENTS.md` is the source of truth; detailed rules live in the skills under `.agents/skills/`.
- Keep `src/routes/` thin — route segments only compose layout and page, delegating all business logic and UI to `src/features/<Domain>/`.
- Backend business logic belongs in `apps/server/src` (imported via `@/server/*`), not in the `src/app/(backend)` route shells.
- Every bug fix must include a regression test that fails before the fix and passes after it. The one exception is a pure style/CSS fix where the only possible assertion would be string-matching the stylesheet.
- When a single file grows past ~800 lines, split it — extract sub-components, hooks, helpers, or types.
- Add or update tests for behavior changes, and update documentation, examples, and types when applicable.
- Never commit secrets, credentials, API keys, private keys, `.env` files, generated build output, or unrelated lockfile changes.
- Prefix commit messages with a gitmoji, and name branches `<type>/<feature-name>`.

### Internationalization

User-facing strings are never hard-coded:

- Add keys to a namespace file under `packages/locales/src/default/` (e.g. `agent.ts`, `auth.ts`).
- Ship **en-US and zh-CN by hand in the same pull request**: author the English source in `packages/locales/src/default/*.ts`, mirror it to `locales/en-US/`, and hand-translate `locales/zh-CN/`.
- Leave every other locale to the daily `auto-i18n` workflow. Missing keys fall back to English until that translation PR merges. Don't hand-translate the generated locales.

### Design

When you're designing or building user-facing flows — empty, loading and error states, confirmations, async feedback, button hierarchy, lists at scale, pickers — follow the design values in [DESIGN.md](DESIGN.md): Natural / Meaningful / Certainty / Growth (自然 / 意义感 / 确定性 / 成长).

## Testing

Run the repository's quality check on your changed files:

```bash
bun run check                    # lint + test in a single pass over your working-tree changes
bun run check --type             # full type-check
bun run check path/to/file.ts    # narrow to specific files
```

`--lint`, `--test` and `--type` narrow the scope and compose within one run. With no selector, `check` runs lint and test together — run it once rather than firing a pass per selector. `--lint` auto-fixes and prints the applied fixes as a diff. `--test` auto-discovers related tests and runs them under the nearest owning vitest config.

**Do not run `bun run test`** — the full suite takes around ten minutes. To run a single test file manually, `cd` into the owning package first:

```bash
cd packages/database && bunx vitest run --silent='passed-only' '[file-path]'
```

End-to-end tests live in `e2e/` (Cucumber + Playwright):

```bash
bun run e2e:install
bun run e2e
```

If you cannot run a check, state that clearly in the pull request and explain why.

## Pull Requests

When opening a pull request:

- **Target the `canary` branch.**
- Use a concise title that describes the user-visible change, prefixed with a gitmoji.
- Explain what changed and why.
- Link related issues using `Fixes #123` or `Closes #123` when appropriate.
- Include test results and any manual verification steps.
- Include screenshots or recordings for user-interface changes — light and dark, desktop and mobile width.
- Confirm en-US and zh-CN locale keys are included for any new user-facing string.
- Call out any database migration or new environment variable explicitly.
- Keep the pull request small enough to review effectively.
- Respond to review feedback constructively and update the branch as requested.

Use rebase when pulling: `git pull --rebase`.

### Pull Request Template

```md
## Summary

- What does this change do?

## Motivation

- What problem does it solve?

## Testing

- [ ] Regression test added (or: pure style fix, no assertion worth shipping)
- [ ] `bun run check` passes
- [ ] `bun run check --type` passes
- [ ] Manual testing completed

## i18n

- [ ] No new user-facing strings
- [ ] en-US and zh-CN keys included

## Deploy notes

- [ ] No new environment variables
- [ ] No database migration

## Screenshots / Notes

- Add screenshots (light/dark, desktop/mobile), migration notes, or rollout considerations if relevant.
```

## Documentation

Documentation changes are valuable contributions. Please keep examples accurate, use clear language, and update related pages under `docs/` when behavior or configuration changes. Product update posts go under `docs/changelog/*.mdx` in both English and Chinese.

## License

By contributing, you agree that your contributions will be licensed under the same license as this repository — see [LICENSE](LICENSE).

## Questions

If you are unsure where to start, open a discussion or issue describing what you would like to work on. Maintainers can help identify an appropriate next step.
