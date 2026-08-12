import { randomUUID } from 'node:crypto';
import { Socket, createConnection } from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import {
  JobResponseEnvelopeSchema,
  JobRequestEnvelopeSchema,
  type JobRequestEnvelope,
  type JobResponseEnvelope,
} from './envelope';
import type { ExternalJobRequest } from './external-job';
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  FRAME_DELIMITER,
  MAX_FRAME_BYTES,
} from './frame';

/**
 * Client-side transport for the job Unix-socket IPC protocol (THOTH-059).
 *
 * Writes exactly one newline-terminated JSON frame, enforces connect and response deadlines,
 * caps response buffering at `MAX_FRAME_BYTES`, validates the response schema and echoed
 * `requestId`, and supports cooperative cancellation via `AbortSignal`. Errors are mapped to a
 * small set of typed, retryable/non-retryable client errors so callers (e.g. a future producer
 * inside `@thoth/web`) can decide whether to retry.
 */

export type JobClientErrorCode =
  | 'CONNECT_FAILED'
  | 'CONNECT_TIMEOUT'
  | 'RESPONSE_TIMEOUT'
  | 'FRAME_TOO_LARGE'
  | 'INVALID_RESPONSE'
  | 'REQUEST_ID_MISMATCH'
  | 'ABORTED'
  | 'SERVER_ERROR';

export class JobClientError extends Error {
  public readonly code: JobClientErrorCode;
  public readonly retryable: boolean;

  constructor(code: JobClientErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'JobClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

export type JobClientOptions = {
  socketPath: string;
  connectTimeoutMs?: number;
  responseTimeoutMs?: number;
  signal?: AbortSignal;
};

function isConnectTimeoutRetryable(): boolean {
  // Connect-time failures (worker down/restarting) are always safe to retry from the caller's
  // perspective: nothing was accepted into the queue yet.
  return true;
}

async function sendEnvelope(
  envelope: JobRequestEnvelope,
  options: JobClientOptions
): Promise<JobResponseEnvelope> {
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;

  return new Promise<JobResponseEnvelope>((resolve, reject) => {
    let settled = false;
    let socket: Socket | undefined;
    let responseTimer: ReturnType<typeof setTimeout> | undefined;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    const decoder = new StringDecoder('utf8');
    let buffer = '';

    const cleanup = (): void => {
      if (responseTimer !== undefined) {
        clearTimeout(responseTimer);
      }
      if (connectTimer !== undefined) {
        clearTimeout(connectTimer);
      }
      options.signal?.removeEventListener('abort', onAbort);
      socket?.removeAllListeners();
      socket?.destroy();
    };

    const settle = (error: JobClientError | null, value?: JobResponseEnvelope): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve(value as JobResponseEnvelope);
      }
    };

    function onAbort(): void {
      settle(new JobClientError('ABORTED', 'Request aborted by caller', false));
    }

    if (options.signal?.aborted) {
      settle(new JobClientError('ABORTED', 'Request aborted by caller', false));
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });

    socket = createConnection({ path: options.socketPath });

    connectTimer = setTimeout(() => {
      settle(
        new JobClientError('CONNECT_TIMEOUT', 'Timed out connecting to job socket', isConnectTimeoutRetryable())
      );
    }, connectTimeoutMs);

    socket.once('connect', () => {
      clearTimeout(connectTimer);
      socket?.write(JSON.stringify(envelope) + FRAME_DELIMITER);

      responseTimer = setTimeout(() => {
        settle(new JobClientError('RESPONSE_TIMEOUT', 'Timed out waiting for job socket response', true));
      }, responseTimeoutMs);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk);

      if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES) {
        settle(new JobClientError('FRAME_TOO_LARGE', 'Response frame exceeded maximum size', false));
        return;
      }

      const newlineIndex = buffer.indexOf(FRAME_DELIMITER);
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex);

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(line);
      } catch {
        settle(new JobClientError('INVALID_RESPONSE', 'Response was not valid JSON', false));
        return;
      }

      const parsed = JobResponseEnvelopeSchema.safeParse(parsedJson);
      if (!parsed.success) {
        settle(new JobClientError('INVALID_RESPONSE', 'Response failed schema validation', false));
        return;
      }

      if (parsed.data.requestId !== envelope.requestId) {
        settle(new JobClientError('REQUEST_ID_MISMATCH', 'Response requestId did not match request', false));
        return;
      }

      settle(null, parsed.data);
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(connectTimer);
      settle(
        new JobClientError('CONNECT_FAILED', `Failed to connect to job socket: ${error.message}`, true)
      );
    });

    socket.on('close', () => {
      if (!settled) {
        settle(new JobClientError('CONNECT_FAILED', 'Job socket closed before a response was received', true));
      }
    });
  });
}

/** Sends a `ping` request and returns the parsed response envelope. */
export async function pingJobService(
  options: JobClientOptions
): Promise<JobResponseEnvelope> {
  const envelope = JobRequestEnvelopeSchema.parse({
    version: 1,
    requestId: randomUUID(),
    kind: 'ping',
  });
  return sendEnvelope(envelope, options);
}

/** Sends an `enqueue` request for the given external job and returns the parsed response envelope. */
export async function enqueueJob(
  job: ExternalJobRequest,
  options: JobClientOptions
): Promise<JobResponseEnvelope> {
  const envelope = JobRequestEnvelopeSchema.parse({
    version: 1,
    requestId: randomUUID(),
    kind: 'enqueue',
    job,
  });
  return sendEnvelope(envelope, options);
}
