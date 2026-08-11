import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { getEnvironment } from '../environment';

/**
 * Resolves the Unix-socket path the jobs worker binds to.
 *
 * `JOB_SOCKET_PATH` must be absolute and explicit in production/test. In development it
 * defaults to a short, per-UID private path under `os.tmpdir()` so a developer doesn't need to
 * configure anything to run `pnpm dev:jobs` locally. The parent directory is created with mode
 * `0700` by the socket server before binding (see `socket/server.ts`) regardless of which path
 * is used.
 */
export function resolveJobSocketPath(): string {
  const environment = getEnvironment();

  if (environment.JOB_SOCKET_PATH) {
    if (!nodePath.isAbsolute(environment.JOB_SOCKET_PATH)) {
      throw new Error('JOB_SOCKET_PATH must be an absolute path');
    }
    return environment.JOB_SOCKET_PATH;
  }

  if (environment.NODE_ENV !== 'development') {
    throw new Error('JOB_SOCKET_PATH is required outside of development');
  }

  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return nodePath.join(tmpdir(), `thoth-jobs-${uid}`, 'jobs.sock');
}
