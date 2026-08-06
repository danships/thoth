// A per-view in-process keyed lock (THOTH-052), mirroring the mitigation used for `file-usage`
// syncing in `src/lib/files/usage.ts`: SuperSave has no optimistic-concurrency/CAS primitive of
// its own, so a `PATCH /views/:id` retrieve-check-update sequence for the *same* view could
// otherwise race across two concurrent requests (e.g. two tabs both dragging a header at once)
// and silently clobber one write. Serialising same-view requests here closes that window.
//
// This is a process-local mitigation only — it does not protect against races across multiple
// server instances. The `expectedLastUpdated` optimistic-concurrency check (409 on mismatch)
// remains the authoritative cross-instance safeguard; this lock just prevents two same-process
// requests from both passing that check based on the same stale snapshot.
const viewLocks = new Map<string, Promise<unknown>>();

export async function withViewLock<T>(viewId: string, task: () => Promise<T>): Promise<T> {
  const previous = viewLocks.get(viewId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  viewLocks.set(viewId, tracked);
  try {
    return await run;
  } finally {
    if (viewLocks.get(viewId) === tracked) {
      viewLocks.delete(viewId);
    }
  }
}
