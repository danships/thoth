---
name: database-repositories
description: Use when reading from or writing to the database in the Thoth project. Covers repository access, query building, entity definitions, and the SuperSave ORM patterns used throughout the codebase.
---

## Available Repositories

Obtain repositories via the async factory functions from `@/lib/database`. Each call reuses the singleton database connection.

```typescript
import {
  getContainerRepository,  // pages, data-sources, workspaces-as-containers
  getWorkspaceRepository,  // workspace entities
  getDataViewRepository,   // data view entities
} from '@/lib/database';

const containerRepository = await getContainerRepository();
const workspaceRepository = await getWorkspaceRepository();
const dataViewRepository  = await getDataViewRepository();
```

## Repository Methods

The repositories come from the **SuperSave** ORM. Key methods:

```typescript
// Fetch multiple records
const records = await repository.getByQuery(query);

// Fetch a single record (returns undefined if not found)
const record = await repository.getOneByQuery(query);

// Create a new record (id is auto-generated)
const created = await repository.create({
  name: 'My Page',
  userId: session.user.id,
  workspaceId: workspace.id,
  // ... all required entity fields
});

// Update an existing record (pass the full entity with modified fields)
const updated = await repository.update({ ...existing, name: 'New Name' });

// Delete a record by id
await repository.delete(record.id);
```

## Building Queries

Start from `repository.createQuery()` and chain filter methods. **The scoping helper you use depends
on the entity category (THOTH-042):**

- **CONTENT** (`Container` pages/data-sources, `DataView`) — scope by **workspace**, never by
  creator. Use `addWorkspaceIdToQuery`, then enforce access via `assertContentAccess` /
  `filterContainersByGrantForSession` (see `.agents/skills/securing-routes/SKILL.md`).
- **PER-USER STATE** (`ContainerAccess` — starred/last-accessed) — scope by `userId` via
  `addUserIdToQuery`. This is the *only* legitimate remaining use of `addUserIdToQuery`.

```typescript
import { addWorkspaceIdToQuery, addUserIdToQuery } from '@/lib/database/helpers';

// CONTENT: scoped by workspace, not creator (THOTH-042)
const query = addWorkspaceIdToQuery(repository.createQuery(), workspace.id)
  .eq('type', 'page')
  .in('id', ['id1', 'id2'])            // IN clause
  .sort('lastUpdated', 'desc')          // order by
  .limit(50);                           // row limit

// PER-USER STATE: scoped by userId (Category B — e.g. ContainerAccess)
const starred = addUserIdToQuery(containerAccessRepository.createQuery().eq('starred', true), session.user.id);
```

`addUserIdToQuery` carries a JSDoc warning that it must never be used to gate content rows — see
`apps/web/src/lib/database/helpers.ts`.

## Entities

Entity definitions live in `packages/database/src/entities/` (part of `@thoth/database`). The three main entities are:

| Constant | Entity type | Typical use |
|----------|-------------|-------------|
| `CONTAINER_NAME` | `Container` | Pages and data-source containers |
| `WORKSPACE_NAME` | `Workspace` | User workspaces |
| `DATA_VIEW_NAME` | `DataView` | Saved data views |
| `MEMBER_SCOPED_CONTAINER_NAME` | `MemberScopedContainer` | Join table: a workspace member scoped to specific containers (mirrors `AppScopedContainer`) |

Entity TypeScript types live in `packages/database/src/types.ts`, re-exported via `@thoth/database/types`. Always import the type, not the entity class, for typing variables:

```typescript
import type { Container, Workspace, DataView } from '@thoth/database/types';
```

## Creating Records

When calling `repository.create()`, you must supply all required fields. Auto-generated fields (such as `id`) are added by SuperSave — do not include them:

```typescript
const page = await containerRepository.create({
  name: body.name,
  emoji: body.emoji ?? null,
  type: 'page' as const,
  parentId: body.parentId ?? null,
  workspaceId: workspace.id,
  userId: session.user.id,
  createdAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
});
```

## Retrievers (Complex Queries)

For queries that join or aggregate across multiple entities, use a **retriever** from `apps/web/src/lib/database/retrievers/` rather than inline repository chaining:

```typescript
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';

// Fetches a page and throws NotFoundError if not found or inaccessible
const page = await pageRetriever.retrievePage(params.id, session.user.id);
```

Add new retrievers here when a route's data-fetching logic is complex enough to be reused across routes.

## Migrations

Database migrations live in `packages/database/src/migrations/` (part of `@thoth/database`). Unlike before, schema sync/migrations are **never** run automatically by the long-running web process — the web app always opens the database with sync disabled (`skipSync: true`). Instead, run `pnpm db:migrate` (delegates to the standalone `packages/database/src/cli/migrate.ts` CLI) to create/upgrade the schema before starting/upgrading the server; the Docker images and test bootstraps (integration `global-setup.ts`, Playwright's `webServer.command`) run this automatically. Adding a new entity field does not always require a migration — SuperSave often handles new/optional fields automatically. When a migration genuinely is needed (e.g. backfilling existing rows), create a migration file and register it in `packages/database/src/migrations/index.ts`, preserving existing migration names/order so applied-migration tracking on upgraded databases isn't broken.

## Package Scope: DB Querying vs. Business Logic (THOTH-062)

`@thoth/database` (`packages/database/`) is scoped to **DB types, configuration and querying** —
repositories, entity/migration definitions, and pure algorithm helpers reused by multiple
consumers (e.g. `delta`/`reconstruct`/`coalesce`/`consolidate` under `src/history/`, used by both
the web app's diff rendering and job maintenance). It deliberately does **not** own
business/orchestration logic that is only ever invoked from one place. For example, page-history
consolidation/retention orchestration (`maintainPageHistory`) lives in
`apps/jobs/src/handlers/history/maintenance.ts`, not in `packages/database` — it composes the
package's repositories, types, and pure algorithm exports, but the maintenance business logic
itself belongs with its sole caller (the `history.maintain` job handler). When adding new
scheduled/business logic that only jobs (or only web) will call, put the orchestration in that
app, importing the querying/algorithm primitives it needs from `@thoth/database`'s root or
`./types` exports rather than growing the database package with app-specific logic.

## Auth-Free Maintenance Primitives (THOTH-063)

`packages/database/src/services/maintenance/` holds the DB-pure primitives behind every
destructive purge operation: eligible-row batch selection, workspace cascade deletion, deleted
page/data-view root permanent deletion, dangling file-usage resolution, and terminal job-row
pruning queries. These are **pure `@thoth/database`-context functions** — no environment reading,
no logging, no `process.exit`, no HTTP/session concerns. Both the scheduled `@thoth/jobs` handlers
(`apps/jobs/src/handlers/maintenance/`) and the manual `pnpm {workspaces,pages,files}:purge` CLI
wrappers (`scripts/purge-*.ts`) call these same functions — never re-implement purge logic in a
caller. See `docs/JOBS_AND_MAINTENANCE.md` at the repo root for the full operations reference
(schedules, grace/retention environment variables, retry semantics).

Key invariants preserved by these primitives (do not weaken when extending them):

- **Content is scoped by workspace/root identity, never creator `userId`** — same THOTH-042 rule
  as the rest of the database layer.
- **Grace period + 1-hour race-safety margin**: a candidate is only eligible if its `deletedAt`
  is valid and older than the configured grace threshold, *and* its `lastUpdated` is older than a
  1-hour margin (protects against deleting something that was just touched/restored).
  Malformed/missing timestamps are always treated as **not eligible**, never as eligible.
- **Immediate revalidation before delete**: the primitive re-fetches/re-checks the target
  immediately before the destructive operation, not just at initial selection time, so a
  restore/upload-attach racing the scan is never purged.
- **Idempotent targets**: a row already deleted by an earlier (possibly crashed) attempt is
  success, not an error; a partially-completed cascade simply continues from whatever remains.
- **Cascade completeness**: when adding a new workspace-scoped entity, you must add it to the
  workspace cascade deletion order in `workspace-cascade.ts` — there is a dedicated test that
  fails when a new workspace-scoped entity is registered without a corresponding cascade policy.



```typescript
// CONTENT: fetch by id (no owner gate), then assert access on the row's own workspaceId
// (THOTH-042 — see assertContentAccess in .agents/skills/securing-routes/SKILL.md)
const existing = await containerRepository.getOneByQuery(
  containerRepository.createQuery().eq('id', params.id)
);
if (!existing) throw new NotFoundError('Resource not found');
await assertContentAccess(session, existing, { mutating: true });

// Get the workspace by slug (needed when creating top-level resources)
const workspace = await workspaceRepository.getOneByQuery(
  workspaceRepository.createQuery().eq('slug', workspaceSlug)
);
if (!workspace) throw new Error('Workspace not found');
```

## Member Grants (`memberToAccessGrant`)

A workspace member's capability is modelled with the **same shape** as an App's `AccessGrant`
(`permission`: `'read' | 'read_write'`, `scopeType`: `'workspace' | 'containers' | 'containers_with_children'`),
stored on the `workspace-member` row. `memberToAccessGrant(member)` (`apps/web/src/lib/auth/access-grant.ts`)
builds an `AccessGrant` from that row, reading the `member-scoped-container` join table
(`getMemberScopedContainerRepository()`) when `scopeType` is not `'workspace'` — mirroring
`appToAccessGrant`. This lets `assertGrantAllowsContainer` / `filterContainersByGrant` /
`assertGrantAllowsWrite` apply identically to human members and Apps.
