import { headers } from 'next/headers';
import { auth } from './config';

export async function getSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session) {
    throw new Error('Session not found');
  }

  return session;
}
