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
- `apps/web/src/lib`: shared libraries — auth (`better-auth`), database repositories (SuperSave ORM), API client, environment validation, and Nanostores-based state.
- `apps/web/src/types`: shared TypeScript types and Zod schemas for API request/response validation.
- `apps/web/tests/e2e`: Playwright end-to-end tests.
- `packages/`: reserved for future extracted packages (currently empty).

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
| `SUPERSAVE_SKIP_SYNC` | No | `false` | Set to `true` to skip automatic schema sync and rely on migrations instead (recommended for production). |
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

A local MySQL database can be started with Docker Compose:

```bash
docker compose up -d
```

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
- Set `SUPERSAVE_SKIP_SYNC=true` and manage schema changes via migrations instead of automatic
  sync.
- Set `BETTER_AUTH_SECRET` to a strong, unique secret (never reuse the development value).

### Available scripts

Run these from the repository root:

| Script | Command | Purpose |
|--------|---------|---------|
| Dev server | `pnpm dev` | Start Next.js with Turbopack (hot-reload) |
| Build | `pnpm build` | Production build via `next build --turbopack` |
| Start | `pnpm start` | Run the production build |
| Lint (all) | `pnpm lint` | Run ESLint + Prettier + TypeScript checks concurrently |
| Format | `pnpm format` | Auto-fix Prettier and ESLint issues in `apps/web/src/` |
| Unit tests | `pnpm test:unit` | Run Vitest unit tests |
| Integration tests | `pnpm test:integration` | Run API integration tests against a live server |
| All fast tests | `pnpm test` | Run unit + integration tests |
| E2E tests | `pnpm test:e2e` | Run Playwright end-to-end tests |
| E2E tests (UI) | `pnpm test:e2e:ui` | Run Playwright tests in interactive UI mode |
| E2E report | `pnpm test:e2e:report` | Show the last Playwright HTML report |
| Seed database | `pnpm db:seed` | Seed the database with sample data |

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
