import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import nodePath from 'node:path';
import type { Logger } from 'winston';
import {
  JobRequestEnvelopeSchema,
  JobResponseEnvelopeSchema,
  type JobResponseEnvelope,
  MAX_FRAME_BYTES,
} from '@thoth/job-protocol';
import type { QueueService } from '../queue/queue-service';
import type { JobRegistry } from '../handlers/registry';
import { FrameParser } from './frame-parser';

export type JobSocketServerOptions = {
  socketPath: string;
  queueService: QueueService;
  registry: JobRegistry;
  logger: Logger;
  readTimeoutMs?: number;
  wake?: () => void;
};

function currentUid(): number {
  return typeof process.getuid === 'function' ? process.getuid() : 0;
}

/** True if a connection attempt succeeds (the socket is live and accepting), false otherwise. */
async function probeSocketIsLive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createConnection({ path: socketPath });
    const finish = (isLive: boolean): void => {
      probe.removeAllListeners();
      probe.destroy();
      resolve(isLive);
    };
    probe.once('connect', () => finish(true));
    probe.once('error', () => finish(false));
  });
}

/**
 * Validates an existing filesystem entry at `socketPath` before (re)binding, and only unlinks a
 * confirmed-stale, same-owner socket file. Never blindly unlinks — a live socket means another
 * jobs process is already the singleton owner and this process must fail to start, not act as a
 * second worker; a symlink/regular-file/directory/foreign-owned entry is refused outright.
 */
async function prepareSocketPath(socketPath: string): Promise<void> {
  const parentDir = nodePath.dirname(socketPath);
  await mkdir(parentDir, { recursive: true, mode: 0o700 });
  await chmod(parentDir, 0o700);

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

  // Confirmed stale (same-owner socket file, connection refused) — safe to remove.
  await unlink(socketPath);
}

/**
 * Unix-socket IPC server for `@thoth/jobs` (THOTH-059). Accepts exactly one UTF-8 JSON frame per
 * connection, validates it, enqueues/pings, writes exactly one response frame, then closes the
 * connection. Filesystem mode/ownership (parent `0700`, socket `0600`, same-UID trust boundary)
 * is the only access control — there is no TCP fallback or HTTP listener.
 */
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

    const timer = setTimeout(() => {
      socket.destroy();
    }, readTimeoutMs);

    const respond = (response: JobResponseEnvelope): void => {
      clearTimeout(timer);
      socket.end(JSON.stringify(JobResponseEnvelopeSchema.parse(response)) + '\n');
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
          error: { code: 'INVALID_REQUEST', message: 'Only a single frame is accepted per connection', retryable: false },
        });
        return;
      }

      void this.handleFrame(result.line, respond);
    });

    socket.on('error', () => {
      clearTimeout(timer);
    });
  }

  private async handleFrame(line: string, respond: (response: JobResponseEnvelope) => void): Promise<void> {
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
          ? String((parsedJson as { requestId: unknown }).requestId)
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
      const dedupeKey = 'dedupeKey' in request.job ? (request.job as { dedupeKey?: string }).dedupeKey : undefined;
      const result = await this.options.queueService.enqueue({
        type: request.job.type,
        payloadVersion: request.job.payloadVersion,
        payload: request.job.payload,
        priority: definition.priority,
        maxAttempts: definition.maxAttempts,
        ...(dedupeKey === undefined ? {} : { dedupeKey }),
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

/** Exposed for tests that need to assert the frame cap without spinning up a real socket. */
export { MAX_FRAME_BYTES };
