/**
 * Keyed in-process async lock (THOTH-062). Queue-level dedupe
 * (`history:<workspaceId>:<containerId>`) already prevents two *queued* `history.maintain` jobs
 * for the same page, but a continuation enqueued by a still-running handler, or a crash-recovery
 * re-entry racing an in-flight execution, could otherwise still run concurrently against the
 * same page inside this one worker process — this lock protects that narrower window without
 * depending on the queue's own guarantees.
 */
/** No-op placeholder assigned before the `Promise` executor below runs synchronously and
 * replaces it — kept at module scope so `withLock` doesn't allocate a fresh closure per call. */
const defaultRelease = (): void => undefined;

export class KeyedLock {
  private readonly tails = new Map<string, Promise<void>>();

  /** Runs `task` exclusively for `key`, queued behind any already-running call for the same key. */
  public async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previousTail = this.tails.get(key) ?? Promise.resolve();

    let releaseNext: () => void = defaultRelease;
    const nextTail = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    this.tails.set(key, nextTail);

    await previousTail;
    try {
      return await task();
    } finally {
      releaseNext();
      // Clean up the map entry once this was the last queued waiter for `key`, so it doesn't
      // grow unbounded across the process lifetime.
      if (this.tails.get(key) === nextTail) {
        this.tails.delete(key);
      }
    }
  }
}
