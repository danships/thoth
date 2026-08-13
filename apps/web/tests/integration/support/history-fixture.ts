// tests/integration/support/history-fixture.ts
//
// Test-only fixture helpers for exercising THOTH-062's scheduled page-history maintenance
// (`history.maintain`) from the integration suite. The maintenance job itself has no externally
// controllable clock — sealed/aged-out runs are made eligible here by opening a second
// `@thoth/database` context against the *same* SQLite file the spawned `@thoth/web`/`@thoth/jobs`
// processes already use (mirroring production's separate-processes-one-database topology) and
// backdating the relevant rows, then enqueuing `history.maintain` directly over the real running
// jobs process's Unix socket (only reachable in `NODE_ENV === 'test'`, see
// `@thoth/job-protocol`'s `external-job.ts`).
import { enqueueJob, type JobResponseEnvelope } from '@thoth/job-protocol';
import {
  createDatabaseContext,
  setDatabaseContext,
  resetDatabaseContext,
  getContainerRepository,
  getPageRevisionRepository,
} from '@thoth/database';

function getIntegrationDatabaseUrl(): string {
  const url = process.env['INTEGRATION_DATABASE_URL'];
  if (!url) throw new Error('INTEGRATION_DATABASE_URL not set — is global-setup running?');
  return url;
}

export function getJobSocketPath(): string {
  const socketPath = process.env['INTEGRATION_JOB_SOCKET_PATH'];
  if (!socketPath) throw new Error('INTEGRATION_JOB_SOCKET_PATH not set — is global-setup running?');
  return socketPath;
}

/**
 * Runs `fn` with a fresh `@thoth/database` context pointed at the integration SQLite file
 * (schema sync disabled — migrations already ran once in `global-setup.ts`), then restores
 * whatever context was previously active. Kept short-lived and serialised per call so it never
 * interleaves with another fixture helper's own context swap.
 */
async function withFixtureDatabaseContext<T>(runWithContext: () => Promise<T>): Promise<T> {
  const context = createDatabaseContext({ connectionString: getIntegrationDatabaseUrl(), skipSync: true });
  setDatabaseContext(context);
  try {
    return await runWithContext();
  } finally {
    await context.close();
    resetDatabaseContext();
  }
}

const AGE_BACKDATE_MS = 25 * 60 * 60 * 1000; // past the 24h consolidation-age + 5-minute coalesce window

/**
 * Backdates every `page-revision` row (both `content` and `values` streams) and the page's own
 * `lastUpdated` for `containerId` so scheduled maintenance sees a quiet page with a sealed,
 * aged-out content run — without waiting 24 real hours. Mirrors the "fixture-created aged/sealed
 * history" the THOTH-062 spec calls for in `page-history.spec.ts`.
 */
export async function agePageHistoryFixture(containerId: string): Promise<void> {
  await withFixtureDatabaseContext(async () => {
    const backdated = new Date(Date.now() - AGE_BACKDATE_MS).toISOString();

    const containerRepository = await getContainerRepository();
    const page = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', containerId));
    if (!page) throw new Error(`agePageHistoryFixture: container ${containerId} not found`);
    await containerRepository.update({ ...page, lastUpdated: backdated });

    const pageRevisionRepository = await getPageRevisionRepository();
    const revisions = await pageRevisionRepository.getByQuery(
      pageRevisionRepository.createQuery().eq('containerId', containerId)
    );
    for (const revision of revisions) {
      await pageRevisionRepository.update({
        ...revision,
        createdAt: backdated,
        lastUpdated: backdated,
        coalesceWindowEnd: backdated,
      });
    }
  });
}

/** Reads back the live `page-revision` rows for `containerId` (both streams), oldest-first. */
export async function readPageHistoryFixture(
  containerId: string
): Promise<Array<{ id: string; sequence: number; target: string; kind: string; consolidated: boolean }>> {
  return withFixtureDatabaseContext(async () => {
    const pageRevisionRepository = await getPageRevisionRepository();
    const revisions = await pageRevisionRepository.getByQuery(
      pageRevisionRepository.createQuery().eq('containerId', containerId).sort('sequence', 'asc')
    );
    return revisions.map((revision) => ({
      id: revision.id,
      sequence: revision.sequence,
      target: revision.target,
      kind: revision.kind,
      consolidated: revision.consolidated,
    }));
  });
}

/** Enqueues `history.maintain` for `(workspaceId, containerId)` over the real running jobs socket. */
export async function enqueueHistoryMaintain(workspaceId: string, containerId: string): Promise<JobResponseEnvelope> {
  return enqueueJob(
    { type: 'history.maintain', payloadVersion: 1, payload: { workspaceId, containerId } },
    { socketPath: getJobSocketPath() }
  );
}

/** Polls `predicate` until it returns `true`, or throws once `timeoutMs` elapses. */
export async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 10_000, intervalMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
