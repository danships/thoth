## Thoth

An open-source, Notion‑inspired application.

Thoth aims to provide a fast, flexible note‑taking and knowledge management experience with a familiar hierarchy of pages and blocks, focusing on simplicity and speed.

### Highlights

- **Open source**: community‑driven, MIT‑licensed.
- **Notion‑inspired UX**: pages, hierarchy, and a clean editor experience.
- **Modern stack**: TypeScript, Next.js 16 (App Router) with Turbopack, React 19, and Mantine UI.

### Architecture

Thoth is a single Next.js application (not a monorepo) with a single `package.json` at the repository root:

- `src/app`: Next.js App Router pages and API routes (`src/app/api`).
- `src/components`: UI components organized using Atomic Design (`atoms`, `molecules`, `organisms`, `templates`).
- `src/lib`: shared libraries — auth (`better-auth`), database repositories (SuperSave ORM), API client, environment validation, and Nanostores-based state.
- `src/types`: shared TypeScript types and Zod schemas for API request/response validation.
- `tests/e2e`: Playwright end-to-end tests.

### Getting Started

Prerequisites: Node.js 24.x and pnpm 10+.

```bash
pnpm install
pnpm dev
```

The dev server runs Next.js with Turbopack and hot-reload at `http://localhost:3000`.

#### Environment variables

The app validates required environment variables at startup (see `src/lib/environment.ts`). At minimum you need:

- `NODE_ENV`: `development`, `production`, or `test`.
- `DB`: database connection string (e.g. `sqlite:///path/to/db.sqlite` or a MySQL connection string).
- `BETTER_AUTH_SECRET`: secret used by `better-auth` for session/auth handling.

Optional:

- `LOG_LEVEL`: logging verbosity (`error`, `warn`, `info`, `http`, `debug`, `trace`; default `info`).
- `SUPERSAVE_SKIP_SYNC`: set to `true` to skip automatic schema sync and rely on migrations (used in production).
- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_DISCOVERY_URL`, `OIDC_AUTHORIZATION_URL`: configure OIDC login; if omitted, credentials-based auth is used instead.

A local MySQL database can be started with Docker Compose:

```bash
docker compose up -d
```

### Available scripts

Run these from the repository root:

| Script | Command | Purpose |
|--------|---------|---------|
| Dev server | `pnpm dev` | Start Next.js with Turbopack (hot-reload) |
| Build | `pnpm build` | Production build via `next build --turbopack` |
| Start | `pnpm start` | Run the production build |
| Lint (all) | `pnpm lint` | Run ESLint + Prettier + TypeScript checks concurrently |
| Format | `pnpm format` | Auto-fix Prettier and ESLint issues in `src/` |
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

- Unit tests (`src/**/*.test.ts`, Vitest) — fast, isolated checks with no server required.
- API integration tests (`tests/integration/api/**/*.test.ts`, Vitest) — real HTTP against a spawned Next.js dev server backed by a seeded SQLite database.
- E2E tests (`tests/e2e/**/*.spec.ts`, Playwright) — browser-based UI interaction tests.

Shared seeded data constants live in `tests/fixtures/seed.ts` and are re-exported from `tests/e2e/constants.ts` for Playwright. See `.agents/commands/e2e-test.md` for E2E conventions.

### Contributing

Issues and PRs are welcome. Please follow TypeScript best practices (prefer `type` over `interface`) and the existing Atomic Design conventions in `src/components`. See `AGENTS.md` for detailed guidance on the codebase's patterns and conventions.

### Releasing

Releases and production Docker images are published automatically via the [`Release`](.github/workflows/release.yml) GitHub Actions workflow whenever a `vX.Y.Z` (stable) or `vX.Y.Z-betaN` (pre-release) tag is pushed, from `main` or any other branch (e.g. a `hotfix/*` branch):

1. **`validate-tag`** checks the tag matches the expected format and fails fast otherwise.
2. **`build-and-push-image`** builds the production image from the root `Dockerfile` and pushes it to GitHub Container Registry (`ghcr.io/<owner>/<repo>:<tag>`), additionally tagging `:latest` for stable (non-beta) releases.
3. **`create-release`** creates a GitHub Release with auto-generated, label-categorized release notes; this only runs once the image has built and pushed successfully.

To cut a release, tag the commit you want to ship and push the tag, e.g. `git tag v1.4.0 && git push origin v1.4.0` (use `-betaN` suffix for pre-releases). See [`docs/RELEASING.md`](docs/RELEASING.md) for the full process, including redoing a release.

### License

MIT
