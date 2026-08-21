import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import nodePath from 'node:path';
import type { Logger } from 'winston';
import {
  JobRequestEnvelopeSchema,
  JobResponseEnvelopeSchema,
  type JobResponseEnvelope,
  type JobCoalescePolicy,
} from '@thoth/job-protocol';
import type { QueueService } from '../queue/queue-service.js';
import type { JobRegistry } from '../handlers/registry.js';
import type { WorkspaceSearchService } from '../search/workspace-search-service.js';
import { FrameParser } from './frame-parser.js';

export type JobSocketServerOptions = {
  socketPath: string;
  queueService: QueueService;
  registry: JobRegistry;
  logger: Logger;
  searchService: WorkspaceSearchService;
  readTimeoutMs?: number;
  searchQueryTimeoutMs?: number;
  wake?: () => void;
};

function currentUid(): number {
  return typeof process.getuid === 'function' ? process.getuid() : 0;
}

async function probeSocketIsLive(socketPath: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createConnection({ path: socketPath });
    const finish = (isLive: boolean): void => {
      clearTimeout(timer);
      probe.removeAllListeners();
      probe.destroy();
      resolve(isLive);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    probe.once('connect', () => finish(true));
    probe.once('error', () => finish(false));
  });
}

async function prepareSocketPath(socketPath: string): Promise<void> {
  const parentDirectory = nodePath.dirname(socketPath);
  const createdDirectory = await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
  if (createdDirectory) {
    await chmod(parentDirectory, 0o700);
  }

  let stat;
  try {
    stat = await lstat(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to bind: ${socketPath} is a symlink`);
  }
  if (stat.isDirectory()) {
    throw new Error(`Refusing to bind: ${socketPath} is a directory`);
  }
  if (!stat.isSocket()) {
    throw new Error(`Refusing to bind: ${socketPath} is a regular file`);
  }
  if (stat.uid !== currentUid()) {
    throw new Error(`Refusing to bind: ${socketPath} is owned by a different user`);
  }

  const isLive = await probeSocketIsLive(socketPath);
  if (isLive) {
    throw new Error(`Refusing to start: ${socketPath} is already accepting connections (singleton jobs process)`);
  }

  await unlink(socketPath);
}

export class JobSocketServer {
  private readonly options: JobSocketServerOptions;
  private server: Server | undefined;
  private shuttingDown = false;

  constructor(options: JobSocketServerOptions) {
    this.options = options;
  }

  public async start(): Promise<void> {
    await prepareSocketPath(this.options.socketPath);

    const previousUmask = process.umask(0o077);
    try {
      this.server = createServer((socket) => this.handleConnection(socket));
      await new Promise<void>((resolve, reject) => {
        this.server?.once('error', reject);
        this.server?.listen(this.options.socketPath, () => {
          this.server?.removeListener('error', reject);
          resolve();
        });
      });
      this.server.on('error', (error: Error) => {
        this.options.logger.error('job.socket.error', { message: error.message });
      });
    } finally {
      process.umask(previousUmask);
    }

    await chmod(this.options.socketPath, 0o600);
    this.options.logger.info('job.socket.listening', { socketPath: this.options.socketPath });
  }

  public async stop(): Promise<void> {
    this.shuttingDown = true;
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    try {
      await unlink(this.options.socketPath);
    } catch {
      // Already gone — fine.
    }
    this.options.logger.info('job.socket.closed', { socketPath: this.options.socketPath });
  }

  private handleConnection(socket: Socket): void {
    const parser = new FrameParser();
    const readTimeoutMs = this.options.readTimeoutMs ?? 2000;
    let responded = false;

    const timer = setTimeout(() => {
      socket.destroy();
    }, readTimeoutMs);

    const clearReadTimer = (): void => {
      clearTimeout(timer);
    };

    const respond = (response: JobResponseEnvelope): void => {
      if (responded) {
        return;
      }
      responded = true;
      clearReadTimer();
      socket.end(JSON.stringify(JobResponseEnvelopeSchema.parse(response)) + '\n', () => {
        socket.destroy();
      });
    };

    socket.on('data', (chunk: Buffer) => {
      const result = parser.push(chunk);

      if (result.status === 'incomplete') {
        return;
      }
      if (result.status === 'too-large') {
        respond({
          version: 1,
          requestId: 'unknown',
          ok: false,
          error: { code: 'FRAME_TOO_LARGE', message: 'Request frame exceeded maximum size', retryable: false },
        });
        return;
      }
      if (result.status === 'multiple-frames') {
        respond({
          version: 1,
          requestId: 'unknown',
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Only a single frame is accepted per connection',
            retryable: false,
          },
        });
        return;
      }

      void this.handleFrame(result.line, respond, clearReadTimer).catch((error: unknown) => {
        this.options.logger.error('job.socket.handleFrame.unhandled', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
        socket.destroy();
      });
    });

    socket.on('error', () => {
      clearReadTimer();
    });
  }

  private static normalizeRequestId(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      return 'unknown';
    }
    return value.length > 200 ? value.slice(0, 200) : value;
  }

  private async handleFrame(
    line: string,
    respond: (response: JobResponseEnvelope) => void,
    clearReadTimer: () => void
  ): Promise<void> {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(line);
    } catch {
      respond({
        version: 1,
        requestId: 'unknown',
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Malformed JSON', retryable: false },
      });
      return;
    }

    const parsed = JobRequestEnvelopeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      const requestId =
        typeof parsedJson === 'object' && parsedJson !== null && 'requestId' in parsedJson
          ? JobSocketServer.normalizeRequestId((parsedJson as { requestId: unknown }).requestId)
          : 'unknown';
      const version =
        typeof parsedJson === 'object' && parsedJson !== null && 'version' in parsedJson
          ? (parsedJson as { version: unknown }).version
          : undefined;
      respond({
        version: 1,
        requestId,
        ok: false,
        error: {
          code: version !== 1 && version !== undefined ? 'UNSUPPORTED_VERSION' : 'INVALID_REQUEST',
          message: 'Request failed schema validation',
          retryable: false,
        },
      });
      return;
    }

    const request = parsed.data;
    if (this.shuttingDown) {
      respond({
        version: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: 'SHUTTING_DOWN', message: 'Jobs service is shutting down', retryable: true },
      });
      return;
    }

    if (request.kind === 'ping') {
      respond({ version: 1, requestId: request.requestId, ok: true, result: {} });
      return;
    }

    if (request.kind === 'status') {
      const record = this.options.queueService.get(request.jobId);
      respond({
        version: 1,
        requestId: request.requestId,
        ok: true,
        result: record ? { found: true, status: record.status } : { found: false },
      });
      return;
    }

    if (request.kind === 'search') {
      clearReadTimer();
      let timeoutTimer: NodeJS.Timeout | undefined;
      try {
        const results = await Promise.race([
          this.options.searchService.search({
            workspaceId: request.workspaceId,
            query: request.query,
            limit: request.limit,
            grant:
              request.grant.scopedContainerIds === undefined
                ? {
                    workspaceId: request.grant.workspaceId,
                    permission: request.grant.permission,
                    scopeType: request.grant.scopeType,
                  }
                : {
                    workspaceId: request.grant.workspaceId,
                    permission: request.grant.permission,
                    scopeType: request.grant.scopeType,
                    scopedContainerIds: request.grant.scopedContainerIds,
                  },
          }),
          new Promise<never>((_, reject) => {
            timeoutTimer = setTimeout(
              () => reject(new Error('Search timed out')),
              this.options.searchQueryTimeoutMs ?? 120_000
            );
          }),
        ]);
        respond({
          version: 1,
          requestId: request.requestId,
          ok: true,
          result: { searchResults: results.map((result) => ({ pageId: result.pageId, score: result.score, snippet: result.snippet })) },
        });
      } catch (error) {
        this.options.logger.error('job.socket.search.failed', {
          workspaceId: request.workspaceId,
          message: error instanceof Error ? error.message : 'unknown error',
        });
        respond({
          version: 1,
          requestId: request.requestId,
          ok: false,
          error: {
            code: 'SEARCH_UNAVAILABLE',
            message: 'Search is temporarily unavailable',
            retryable: true,
          },
        });
      } finally {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
      }
      return;
    }

    const definition = this.options.registry.get(request.job.type);
    if (!definition) {
      respond({
        version: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Unknown job type', retryable: false },
      });
      return;
    }

    try {
      const derivedDedupeKey = definition.dedupeKey?.(request.job.payload);
      const dedupeKey =
        derivedDedupeKey ??
        ('dedupeKey' in request.job ? (request.job as { dedupeKey?: string }).dedupeKey : undefined);
      const result = await this.options.queueService.enqueue({
        type: request.job.type,
        payloadVersion: request.job.payloadVersion,
        payload: request.job.payload,
        priority: definition.priority,
        maxAttempts: definition.maxAttempts,
        ...(dedupeKey === undefined ? {} : { dedupeKey }),
        ...(definition.coalesce === undefined ? {} : { coalesce: definition.coalesce as JobCoalescePolicy<unknown> }),
      });

      this.options.logger.info('job.enqueue', {
        jobId: result.record.id,
        type: result.record.type,
        disposition: result.disposition,
      });

      this.options.wake?.();
      respond({
        version: 1,
        requestId: request.requestId,
        ok: true,
        result: { jobId: result.record.id, disposition: result.disposition },
      });
    } catch {
      respond({
        version: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: 'QUEUE_UNAVAILABLE', message: 'Failed to enqueue job', retryable: true },
      });
    }
  }
}

export { MAX_FRAME_BYTES } from '@thoth/job-protocol';
