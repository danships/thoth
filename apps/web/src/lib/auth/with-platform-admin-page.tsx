import type { User } from 'better-auth';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from './config';
import { assertPlatformAdmin } from './platform-user';
import { HttpError } from '@/lib/errors/http-error';

/**
 * Wraps an async server page component so it can only be rendered by a platform administrator
 * (THOTH-045). Unauthenticated visitors are redirected to `/login`; authenticated non-admins get
 * Next's `notFound()` (a 404, so the admin area's existence isn't advertised). Modelled on
 * `withAuthPage` in `with-auth-page.tsx`.
 */
export function withPlatformAdminPage<Properties extends Record<string, unknown> = Record<string, never>>(
  Component: (properties: Properties & { session: { user: User } }) => React.ReactNode,
  options: { redirectTo?: string } = {}
) {
  return async function PlatformAdminPage(properties: Properties) {
    const auth = await getAuth();
    const session = await auth!.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      redirect(options.redirectTo ?? '/login');
    }

    try {
      await assertPlatformAdmin(session as { user: User });
    } catch (error) {
      // A non-admin (403) — or anything short of a genuine admin — is surfaced as a 404 so the
      // admin area stays invisible to non-admins.
      if (error instanceof HttpError) {
        notFound();
      }
      throw error;
    }

    return <Component {...properties} session={session} />;
  };
}
