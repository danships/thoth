import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/config';

export default async function Home() {
  const auth = await getAuth();
  const session = await auth!.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  redirect('/pages');
}
