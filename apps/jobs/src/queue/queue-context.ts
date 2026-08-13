import type { QueueService } from './queue-service.js';

/**
 * Module-level singleton exposing this process's own `QueueService` instance to job handlers
 * (THOTH-063), mirroring `@thoth/database`'s `setDatabaseContext`/`getDatabaseContext` pattern.
 * Needed only by `maintenance.prune-jobs` (the one handler that must directly operate on the
 * queue's own terminal-record store) — every other handler talks exclusively to
 * `@thoth/database`/`@thoth/storage`. Set once in `index.ts` right after the `QueueService` is
 * constructed, before the registry (and therefore the maintenance handlers) is built.
 */
let currentQueueService: QueueService | undefined;

export function setQueueService(queueService: QueueService): void {
  currentQueueService = queueService;
}

export function getQueueService(): QueueService {
  if (!currentQueueService) {
    throw new Error('QueueService accessed before it was set — call setQueueService() first');
  }
  return currentQueueService;
}

/** Test-only helper to reset the singleton between test files. */
export function resetQueueServiceForTests(): void {
  currentQueueService = undefined;
}
