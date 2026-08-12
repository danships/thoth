import { NextResponse } from 'next/server';
import { isJobsServiceReady } from '@/lib/jobs/health';

/**
 * Public liveness/readiness endpoint (THOTH-060). Reports the Next.js process (always `ok` if
 * this handler runs at all) and the `@thoth/jobs` Unix-socket process (via a short-timeout
 * `ping`, see `isJobsServiceReady`). Returns 200 only when both components are ready, otherwise
 * 503 — never exposes DB state, queue depth, socket paths, process ids, job payloads, or
 * exception text, per the security requirements of THOTH-060.
 */
export async function GET() {
  const jobsReady = await isJobsServiceReady();

  const components = {
    web: 'ok',
    jobs: jobsReady ? 'ok' : 'unavailable',
  } as const;

  if (jobsReady) {
    return NextResponse.json({ status: 'ok', components });
  }

  return NextResponse.json({ status: 'unavailable', components }, { status: 503 });
}
