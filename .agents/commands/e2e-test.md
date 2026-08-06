# Playwright E2E Test Guide

## Directory structure

```
tests/
├── fixtures/
│   └── seed.ts             # Canonical shared SEED constants
├── integration/
│   └── api/                # Vitest API integration tests (no browser)
└── e2e/
    ├── .auth/              # gitignored — generated storage state
    ├── constants.ts        # Re-exports SEED from ../fixtures/seed
    ├── fixtures/
    │   └── test.ts         # Extended test object; import from here, not @playwright/test
    ├── global.setup.ts     # Seeds DB + writes auth cookie; runs once before all tests
    ├── auth/
    ├── pages/
    ├── data-sources/
    ├── data-views/
    └── page-values/
```

## What every spec must cover

1. **Happy path** — primary flow completes, user lands on the correct URL.
2. **Validation** — invalid input surfaces an error message near the field.
3. **Error notifications** — API errors appear as Mantine alerts; assert `page.getByRole('alert')`.
4. **Navigation** — correct URL after the action.
5. **Key elements** — headings, buttons, or tabs that identify the feature are visible.

## Suite boundaries

- Playwright specs should only cover flows that require real browser or UI interaction.
- API-only test cases belong in `tests/integration/api/` (Vitest), not in Playwright specs.
- Pure logic and isolated helpers belong in unit tests under `src/**/*.test.ts`.

## Other test suites

- Unit tests: `pnpm test:unit` (Vitest, `src/**/*.test.ts`)
- Integration tests: `pnpm test:integration` (Vitest, `tests/integration/api/**/*.test.ts`)

## Running E2E tests (THOTH-064)

`pnpm test:e2e*` scripts all run through the hermetic launcher (`scripts/run-end-to-end-tests.ts`), which
gives every invocation its own temporary SQLite database and upload folder — so repeated or
interrupted runs never leak state into the next one — then forwards all CLI args unchanged to
`pnpm exec playwright test`.

Recommended loop:

- **While implementing**: run the spec you're touching directly, e.g.
  `pnpm test:e2e -- tests/e2e/pages/page-detail.spec.ts:96`.
- **Before hand-off**: `pnpm test:e2e:changed` — uses Playwright's Git-diff-based
  `--only-changed --pass-with-no-tests`. This is an optimisation for local iteration, **not**
  the pre-push acceptance gate; it can miss tests affected only indirectly.
- **While diagnosing a failure**: `pnpm test:e2e:last-failed` reruns only the tests recorded in
  `test-results/.last-run.json` (kept outside the temporary per-run state) against a fresh
  database.
- **Before pushing**: the full `pnpm test:e2e` gate — every spec, fresh state.
- `pnpm test:e2e:ui` opens the Playwright UI mode through the same launcher.
- `pnpm test:e2e:report` opens the last HTML report.

## Auth

All tests start authenticated via a seeded session cookie — no login step needed.
Works in both credentials and OIDC mode (session is written directly to the DB).

Unauthenticated tests (login, signup): override at the top of the file:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

## Seeded data

`tests/fixtures/seed.ts` defines the canonical `SEED` object with fixed UUIDs for the test
user, workspace, pages, data source, columns, data view, and a data row with pre-filled
values. `tests/e2e/constants.ts` re-exports that same object for Playwright imports.

Use `SEED.*` IDs in specs. To seed additional data for a new feature, add it to
`scripts/end-to-end-seed.ts` (idempotent — uses existence checks) and export the new IDs from
`tests/fixtures/seed.ts`.

## Imports

```typescript
import { test, expect } from '../fixtures/test';   // adjust depth as needed
import { SEED } from '../constants';
```

## Selectors

Prefer ARIA: `getByRole`, `getByLabel`, `getByText`. Add `aria-label` to icon-only
buttons so they are addressable by name.

Timing notes:

- BlockNote editor: `toBeVisible({ timeout: 10_000 })` — hydrates asynchronously.
- Mantine notifications auto-dismiss in 5 s; assert within `{ timeout: 6_000 }`.
- `contentEditable` headings: use `press('Control+A')` + `type()`, not `fill()`.

## OIDC mode

When `OIDC_*` env vars are set, the login page has no email/password fields. Guard
credentials-specific assertions by checking `authMode` from `GET /api/v1/config` first,
or skip those tests when `process.env.OIDC_CLIENT_ID` is set.
