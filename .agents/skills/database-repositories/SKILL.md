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

Start from `repository.createQuery()` and chain filter methods:

```typescript
const query = repository.createQuery()
  .eq('userId', session.user.id)       // equality
  .eq('type', 'page')
  .in('id', ['id1', 'id2'])            // IN clause
  .sort('lastUpdated', 'desc')          // order by
  .limit(50);                           // row limit
```

Always add the user scope via the helper from `@/lib/database/helpers` — never filter by `userId` manually:

```typescript
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';

const query = addUserIdToQuery(repository.createQuery(), session.user.id);
// chain additional filters:
query.eq('type', 'page').sort('createdAt', 'desc');
```

## Entities

Entity definitions live in `src/lib/database/entities/`. The three main entities are:

| Constant | Entity type | Typical use |
|----------|-------------|-------------|
| `CONTAINER_NAME` | `Container` | Pages and data-source containers |
| `WORKSPACE_NAME` | `Workspace` | User workspaces |
| `DATA_VIEW_NAME` | `DataView` | Saved data views |

Entity TypeScript types are in `src/types/database/`. Always import the type, not the entity class, for typing variables:

```typescript
import type { Container, Workspace, DataView } from '@/types/database';
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

For queries that join or aggregate across multiple entities, use a **retriever** from `src/lib/database/retrievers/` rather than inline repository chaining:

```typescript
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';

// Fetches a page and throws NotFoundError if not found or inaccessible
const page = await pageRetriever.retrievePage(params.id, session.user.id);
```

Add new retrievers here when a route's data-fetching logic is complex enough to be reused across routes.

## Migrations

Database migrations live in `src/lib/database/migrations/`. Migrations run automatically at startup (unless `SUPERSAVE_SKIP_SYNC=true`). When adding a new entity field, create a migration file and register it in `src/lib/database/migrations/index.ts`.

## Common Patterns

```typescript
// Check resource exists and belongs to user before mutation
const existing = await containerRepository.getOneByQuery(
  addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id)
);
if (!existing) throw new NotFoundError('Resource not found');

// Get the user's workspace (needed when creating top-level resources)
const workspace = await workspaceRepository.getOneByQuery(
  addUserIdToQuery(workspaceRepository.createQuery(), session.user.id)
);
if (!workspace) throw new Error('Workspace not found');
```
