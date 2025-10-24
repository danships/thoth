import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/config';

/**
 * Auth route handlers for better-auth.
 *
 * We lazily initialize the auth handlers inside each function rather than at module level
 * to avoid invoking getAuth() during import. This is important because:
 *
 * 1. getAuth() initializes database connections and other side effects
 * 2. Module imports happen at build time and in various contexts where the database
 *    might not be available or desired
 * 3. By deferring initialization until the route is actually hit, we ensure the
 *    auth system is only set up when needed
 */

export async function GET(request: Request) {
  const auth = await getAuth();
  const handlers = toNextJsHandler(auth);
  return handlers.GET(request);
}

export async function POST(request: Request) {
  const auth = await getAuth();
  const handlers = toNextJsHandler(auth);
  return handlers.POST(request);
}
