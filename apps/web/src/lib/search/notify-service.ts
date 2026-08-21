import { after } from 'next/server';
import { enqueueJob, JobClientError } from '@thoth/job-protocol';
import { getLogger } from '@/lib/logger';

const MAX_ENQUEUE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function schedulePageSearchSyncNow(page: {
  workspaceId: string;
  id: string;
  type: string;
}): Promise<void> {
  if (page.type !== 'page') {
    return;
  }

  const socketPath = process.env['JOB_SOCKET_PATH'];
  if (!socketPath) {
    return;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ENQUEUE_ATTEMPTS; attempt += 1) {
    try {
      const response = await enqueueJob(
        {
          type: 'search.sync-page',
          payloadVersion: 1,
          payload: {
            workspaceId: page.workspaceId,
            pageId: page.id,
          },
        },
        { socketPath }
      );
      if (!response.ok) {
        throw new JobClientError('SERVER_ERROR', response.error.message, response.error.retryable);
      }
      return;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof JobClientError ? error.retryable : true;
      if (!retryable || attempt === MAX_ENQUEUE_ATTEMPTS) {
        break;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  const logger = await getLogger();
  logger.error('search.sync.enqueue-failed', {
    workspaceId: page.workspaceId,
    pageId: page.id,
    error: lastError,
  });
}

export function schedulePageSearchSync(page: { workspaceId: string; id: string; type: string }): void {
  after(() => schedulePageSearchSyncNow(page));
}

export async function scheduleWorkspaceSearchReconcileNow(workspaceId: string): Promise<void> {
  const socketPath = process.env['JOB_SOCKET_PATH'];
  if (!socketPath) {
    return;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ENQUEUE_ATTEMPTS; attempt += 1) {
    try {
      const response = await enqueueJob(
        {
          type: 'search.reconcile-workspace',
          payloadVersion: 1,
          payload: { workspaceId },
        },
        { socketPath }
      );
      if (!response.ok) {
        throw new JobClientError('SERVER_ERROR', response.error.message, response.error.retryable);
      }
      return;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof JobClientError ? error.retryable : true;
      if (!retryable || attempt === MAX_ENQUEUE_ATTEMPTS) {
        break;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  const logger = await getLogger();
  logger.error('search.reconcile.enqueue-failed', {
    workspaceId,
    error: lastError,
  });
}

export function scheduleWorkspaceSearchReconcile(workspaceId: string): void {
  after(() => scheduleWorkspaceSearchReconcileNow(workspaceId));
}
