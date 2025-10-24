import { headers } from 'next/headers';
import { getAuth } from './config';
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error';

export async function getSession() {
  const headersList = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session) {
    throw new NotAuthorizedError('Session not found');
  }

  return session;
}
