## Thoth

An open-source, Notion‑inspired application.

Thoth aims to provide a fast, flexible note‑taking and knowledge management experience with a familiar hierarchy of pages and blocks, focusing on simplicity and speed.

### Highlights

- **Open source**: community‑driven, MIT‑licensed.
- **Notion‑inspired UX**: pages, hierarchy, and a clean editor experience.
- **Modern stack**: TypeScript, Next.js 16 (App Router) with Turbopack, React 19, and Mantine UI.

### Architecture

Thoth is a pnpm monorepo. The Next.js application lives in `apps/web`, with the repository
root acting as a thin workspace orchestrator (root commands delegate to `apps/web` under the
hood — you don't need to learn new commands or `cd` into `apps/web`):

- `apps/web/src/app`: Next.js App Router pages and API routes (`apps/web/src/app/api`).
- `apps/web/src/components`: UI components organized using Atomic Design (`atoms`, `molecules`, `organisms`, `templates`).
- `apps/web/src/lib`: shared libraries — auth (`better-auth`), API client, environment validation, and Nanostores-based state. Thin adapters around `@thoth/database`/`@thoth/storage` also live here (`apps/web/src/lib/database`, `apps/web/src/lib/storage`) so existing import paths and web-specific concerns (sessions, cookies, request auth) stay unchanged.
- `apps/web/src/types`: shared TypeScript types and Zod schemas for API request/response validation (entity schemas are re-exported from `@thoth/database/schemas`).
- `apps/web/tests/e2e`: Playwright end-to-end tests.
- `packages/database` (`@thoth/database`): framework-agnostic entity schemas, SuperSave entity definitions/repositories, migrations, and DB-pure services shared by the web app (and future services). Has no dependency on Next.js, sessions, or cookies. Its `src/cli/migrate.ts` is the only place schema sync/migrations are ever run — see `pnpm db:migrate` below.
- `packages/storage` (`@thoth/storage`): the storage adapter contract and local-filesystem implementation, with no dependency on the web environment validator or auth/session concerns.

### Getting Started

Prerequisites: Node.js 24.x and pnpm 10+.

```bash
pnpm install
pnpm dev
```

The dev server runs Next.js with Turbopack and hot-reload at `http://localhost:3000`.

#### Environment variables

The app validates required environment variables at startup (see `apps/web/src/lib/environment.ts`
and `apps/web/src/lib/environment/app-url.ts`). Every key is listed below (variable names copied
verbatim from `environmentSchema` to avoid drift):

| Variable | Required? | Default | Description |
|----------|------------|---------|--------------|
| `NODE_ENV` | Yes | — | `development`, `production`, or `test`. |
| `DB` | Yes | — | Database connection string (e.g. `sqlite:///path/to/db.sqlite` or a MySQL connection string). |
| `LOG_LEVEL` | No | `info` | Logging verbosity: `error`, `warn`, `info`, `http`, `debug`, `trace`. |
| `BETTER_AUTH_SECRET` | Yes | — | Secret used by `better-auth` for session/auth handling. |
| `APP_URL` | No | `http://localhost:${PORT ?? 3000}` | The public, absolute base URL Thoth is served at (e.g. `https://thoth.example.com`). Explicitly wired into `better-auth`'s `baseURL`/`trustedOrigins` instead of relying on request-header inference. **Must be set in production** — see "Production deployment" below. No trailing slash. |
| `OIDC_CLIENT_ID` | No | — | OIDC client id. If all four `OIDC_*` vars are set, OIDC login is used; otherwise credentials (email/password) auth is used. |
| `OIDC_CLIENT_SECRET` | No | — | OIDC client secret. |
| `OIDC_DISCOVERY_URL` | No | — | OIDC discovery document URL. |
| `OIDC_AUTHORIZATION_URL` | No | — | OIDC authorization endpoint URL. |
| `WORKSPACE_DELETE_GRACE_PERIOD_DAYS` | No | `30` | Days a soft-deleted workspace is retained before `pnpm workspaces:purge` permanently removes it. |
| `PAGE_DELETE_GRACE_PERIOD_DAYS` | No | `30` | Days a soft-deleted page is retained before permanent purge. |
| `STORAGE_TYPE` | No | `local` | File-storage backend for uploaded files. Only `local` is currently supported. |
| `STORAGE_LOCAL_FOLDER` | No | `data/uploads` | Folder the local storage adapter writes uploaded file bytes to (relative to the process's cwd). |
| `MAX_UPLOAD_SIZE_BYTES` | No | `10485760` (10 MB) | Per-file upload size cap, in bytes. |
| `FILES_PURGE_GRACE_PERIOD_HOURS` | No | `24` | Hours an orphaned uploaded file is retained before `pnpm files:purge` permanently removes it. |
| `PORT` | No | `3000` | **Runtime/Node var, not validated by `envalid`** — consumed directly by the Node HTTP server (`next start`/Docker entrypoint) before the app's env schema is even checked. Only used indirectly here as the default port in `APP_URL`'s fallback. |

`@thoth/jobs` (see "Process topology" below) has its own, separate environment schema
(`apps/jobs/src/environment.ts`) — it never reads `apps/web`'s `BETTER_AUTH_SECRET`, but since
THOTH-061 it opens its own database connection, so `DB` must be set for both processes (the same
connection string works for a single-SQLite-file deployment):

| Variable | Required? | Default | Description |
|----------|------------|---------|--------------|
| `NODE_ENV` | Yes | — | `development`, `production`, or `test`. |
| `DB` | Yes | — | Database connection string, same value as `apps/web`'s `DB` above. Used to load/update webhook deliveries (`webhook.dispatch`/`webhook.deliver`/`webhook.redeliver`, THOTH-061). Opened with schema sync/migrations disabled — `apps/web` owns migrations. |
| `JOB_SOCKET_PATH` | No | a per-UID private temp path | Absolute path to the Unix domain socket `@thoth/jobs` listens on. Also read directly by `apps/web`'s `/api/health` route (`apps/web/src/lib/jobs/health.ts`) to reach the same socket — set it once and pass it to both processes (PM2/Docker/dev harness/tests all do this already). |
| `JOB_POLL_INTERVAL_MS` | No | `1000` | How often the runner polls for due jobs when not woken by an enqueue/retry. |
| `JOB_SHUTDOWN_TIMEOUT_MS` | No | `10000` | How long the process waits for active handlers to finish/abort on SIGTERM/SIGINT before exiting. PM2's `kill_timeout` for `thoth-jobs` (`pm2.config.js`) is deliberately longer than this. |
| `JOB_CONCURRENCY` | No | `4` | Maximum number of jobs executed concurrently. |
| `JOB_RETENTION_MS` | No | `900000` (15 min) | How long terminal (completed/dead) job records are retained in memory before eviction. |
| `JOB_RETENTION_MAX` | No | `500` | Maximum number of terminal job records retained in memory regardless of age. |
| `JOB_SCHEDULER_TICK_MS` | No | `5000` | How often the scheduler ticks to ensure the current interval bucket has been enqueued. |
| `WEBHOOK_DELIVERY_TIMEOUT_MS` | No | `5000` | Per-attempt network timeout (ms) for outbound webhook delivery fetches (THOTH-061). |
| `WEBHOOK_DELIVERY_BACKOFF_BASE_MS` | No | `500` | Base delay (ms) for full-jitter exponential backoff between webhook delivery retry attempts (THOTH-061). |

A local MySQL database can be started with Docker Compose:

```bash
docker compose up -d
```

### Process topology (PM2, web + jobs)

Thoth runs two long-running Node processes side by side, supervised by [PM2](https://pm2.keymetrics.io/)
in production/preview images (`pm2.config.js` at the repository root) and by a lightweight
harness locally/in tests (`scripts/dev.mjs`, `apps/web/tests/integration/global-setup.ts`,
`apps/web/playwright.config.ts`):

- **`thoth-web`** — the Next.js app. The only process that binds an HTTP port (`3000` by
  default). Runs with schema sync always disabled (`skipSync: true`).
- **`thoth-jobs`** (`@thoth/jobs`) — an in-memory job queue/scheduler served over a Unix domain
  socket (never TCP/HTTP). No database access, no exposed port. Never administered via HTTP/UI
  by design (see THOTH-060 non-goals).

Both are PM2 **fork-mode, single-instance** apps (`instances: 1`) — clustering is not supported:
the current queue is a single in-process instance, and the web/session/SQLite test topology has
not been designed for multiple concurrent instances of either process. Each restarts
**independently** on crash (PM2's bounded restart policy); a jobs crash/restart does not disrupt
web (or vice versa) — in-flight leased jobs are recovered by `@thoth/jobs` on its own restart.

**Startup ordering:** a one-shot migration (`pnpm db:migrate`, the `@thoth/database` migration
CLI) must complete **before** PM2 starts either process — see `scripts/start-production.mjs`,
the sole production/preview entrypoint (`pnpm start`/`pnpm start:production`, and both
Dockerfiles' `CMD`). PM2 child restarts never re-run migrations. Within PM2, jobs is declared
first and uses `wait_ready`/`listen_timeout` (jobs signals `process.send('ready')` only after
DB-free startup — lease recovery, scheduler init, and a secure `0600`-mode Unix socket bind — see
`apps/jobs/src/index.ts`), but web may start listening before jobs finishes binding; this is
safe because `/api/health` stays `503` until jobs responds to a real `ping`.

**Health (`GET /api/health`, public, unauthenticated):** returns `200
{ status: 'ok', components: { web: 'ok', jobs: 'ok' } }` only once a short-timeout
(`apps/web/src/lib/jobs/health.ts`, 500ms connect/response) protocol `ping` over
`JOB_SOCKET_PATH` succeeds; otherwise `503 { status: 'unavailable', components: { web: 'ok',
jobs: 'unavailable' } }`. Never exposes DB state, queue depth, the socket path, process ids, job
payloads, or exception text — coarse component status only.

**Local targeted commands** (all delegate to root scripts):

| Script | Command | Purpose |
|--------|---------|---------|
| Full stack dev | `pnpm dev` | Migrate → start `@thoth/jobs` on an isolated socket → wait for a real ping → start `next dev --turbopack`. Fail-fast: either child exiting stops the other and forwards the failure; Ctrl-C/SIGTERM are forwarded to both and only the harness-owned temp socket dir is removed. |
| Web only | `pnpm dev:web` | Starts only `next dev`, for UI-only debugging. `/api/health` correctly reports `jobs: 'unavailable'` unless you separately start `@thoth/jobs` and export the matching `JOB_SOCKET_PATH` yourself. |
| Jobs only | `pnpm dev:jobs` | Starts only `@thoth/jobs` (`tsx watch`), e.g. to pair with `dev:web` above. |
| Build web only | `pnpm build:web` | `next build --turbopack` for `apps/web`. |
| Build jobs only | `pnpm build:jobs` | Compiles `@thoth/jobs` to `apps/jobs/dist`. |

**Logs:** PM2 merges each app's stdout/stderr into `logs/thoth-jobs-*.log` /
`logs/thoth-web-*.log` under the working directory (`pm2.config.js`); use `pm2 logs`/`pm2 logs
thoth-jobs`/`pm2 logs thoth-web` inside the container (`docker exec`) to tail them live.

**Socket security:** the socket's parent directory is created mode `0700`, and the socket file
itself is `chmod 0600` immediately after bind (both owned by the non-root `nextjs` user in
Docker) — it is ephemeral runtime state, not part of any persisted volume.

### Production deployment

- **Always set `APP_URL`** to the exact, absolute public URL of the deployment (e.g.
  `https://thoth.example.com`, no trailing slash). Thoth passes this explicitly into
  `better-auth`'s `baseURL` and `trustedOrigins` rather than inferring it from the incoming
  request's `Host` header, which prevents host-header-based origin spoofing from being trusted
  for cookie/redirect purposes.
- Because the Docker image is built once and can be deployed at several different URLs,
  `APP_URL` is intentionally a **runtime-only, server-side** env var — never a `NEXT_PUBLIC_*`
  build-time variable. The browser-side auth client talks to the same origin serving the page,
  so it needs no URL-related env var at all.
- Schema is never synced automatically by the running web process. Before starting/upgrading
  the server, run `pnpm db:migrate` (delegates to the standalone `@thoth/database` migration
  CLI) to create/upgrade the schema; the Docker images run this automatically before starting
  the server.
- Set `BETTER_AUTH_SECRET` to a strong, unique secret (never reuse the development value).

### Available scripts

Run these from the repository root:

| Script | Command | Purpose |
|--------|---------|---------|
| Dev server | `pnpm dev` | Start the full stack (migrate → jobs → web) with Turbopack hot-reload |
| Dev server (web only) | `pnpm dev:web` | Start only `next dev`, for UI-only debugging |
| Dev server (jobs only) | `pnpm dev:jobs` | Start only `@thoth/jobs` |
| Build | `pnpm build` | Production build of `@thoth/jobs` and `apps/web` (`next build --turbopack`) |
| Start | `pnpm start` / `pnpm start:production` | Migrate once, then run PM2 (`thoth-web` + `thoth-jobs`) via `scripts/start-production.mjs` |
| Lint (all) | `pnpm lint` | Run ESLint + Prettier + TypeScript checks concurrently |
| Format | `pnpm format` | Auto-fix Prettier and ESLint issues in `apps/web/src/` |
| Unit tests | `pnpm test:unit` | Run Vitest unit tests |
| Integration tests | `pnpm test:integration` | Run API integration tests against a live server |
| All fast tests | `pnpm test` | Run unit + integration tests |
| E2E tests | `pnpm test:e2e` | Run Playwright end-to-end tests |
| E2E tests (UI) | `pnpm test:e2e:ui` | Run Playwright tests in interactive UI mode |
| E2E report | `pnpm test:e2e:report` | Show the last Playwright HTML report |
| Seed database | `pnpm db:seed` | Seed the database with sample data |
| Migrate database | `pnpm db:migrate` | Create/upgrade the schema via the standalone `@thoth/database` migration CLI |

### Standalone scripts

- [Notion → Thoth import script](scripts/notion-import/README.md) — a standalone CLI that syncs
  content from a Notion workspace into a Thoth workspace over the public `/api/v1/*` API. See its
  own README for setup, configuration, and usage.

### Testing

Thoth uses three test suites with clear boundaries:

- Unit tests (`apps/web/src/**/*.test.ts`, Vitest) — fast, isolated checks with no server required.
- API integration tests (`apps/web/tests/integration/api/**/*.test.ts`, Vitest) — real HTTP against a spawned Next.js dev server backed by a seeded SQLite database.
- E2E tests (`apps/web/tests/e2e/**/*.spec.ts`, Playwright) — browser-based UI interaction tests.

Shared seeded data constants live in `apps/web/tests/fixtures/seed.ts` and are re-exported from `apps/web/tests/e2e/constants.ts` for Playwright. See `.agents/commands/e2e-test.md` for E2E conventions.

### Contributing

Issues and PRs are welcome. Please follow TypeScript best practices (prefer `type` over `interface`) and the existing Atomic Design conventions in `apps/web/src/components`. See `AGENTS.md` for detailed guidance on the codebase's patterns and conventions.

### Releasing

Releases and production Docker images are published automatically via the [`Release`](.github/workflows/release.yml) GitHub Actions workflow whenever a `vX.Y.Z` (stable) or `vX.Y.Z-betaN` (pre-release) tag is pushed, from `main` or any other branch (e.g. a `hotfix/*` branch):

1. **`validate-tag`** checks the tag matches the expected format and fails fast otherwise.
2. **`build-and-push-image`** builds the production image from the root `Dockerfile` and pushes it to GitHub Container Registry (`ghcr.io/<owner>/<repo>:<tag>`), additionally tagging `:latest` for stable (non-beta) releases.
3. **`create-release`** creates a GitHub Release with auto-generated, label-categorized release notes; this only runs once the image has built and pushed successfully.

To cut a release, tag the commit you want to ship and push the tag, e.g. `git tag v1.4.0 && git push origin v1.4.0` (use `-betaN` suffix for pre-releases). See [`docs/RELEASING.md`](docs/RELEASING.md) for the full process, including redoing a release.

### License

MIT
