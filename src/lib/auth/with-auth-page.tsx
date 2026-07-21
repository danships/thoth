import type { User } from 'better-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './config';

/**
 * Wraps an async server page component so it can only be rendered by an authenticated
 * user. If no session exists, redirects to `/login` before the wrapped component renders.
 * Mirrors the `apiRoute` wrapper (`src/lib/api/route-wrapper.ts`) but for page components.
 */
export function withAuthPage<Properties extends Record<string, unknown> = Record<string, never>>(
  Component: (properties: Properties & { session: { user: User } }) => React.ReactNode,
  options: { redirectTo?: string } = {}
) {
  return async function AuthenticatedPage(properties: Properties) {
    const auth = await getAuth();
    const session = await auth!.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      redirect(options.redirectTo ?? '/login');
    }

    return <Component {...properties} session={session} />;
  };
}

/**
 * Wraps an async server page component so it can only be rendered by a guest (unauthenticated
 * visitor). If a valid session already exists, redirects away (defaults to `/pages`) before the
 * wrapped component renders. Used for `/login` and `/signup` so already-authenticated users are
 * sent straight back into their workspace.
 */
export function withGuestPage<Properties extends Record<string, unknown> = Record<string, never>>(
  Component: (properties: Properties) => React.ReactNode,
  options: { redirectTo?: string } = {}
) {
  return async function GuestPage(properties: Properties) {
    const auth = await getAuth();
    const session = await auth!.api.getSession({
      headers: await headers(),
    });

    if (session?.user) {
      redirect(options.redirectTo ?? '/pages');
    }

    return <Component {...properties} />;
  };
}
