import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { PropsWithChildren, ReactNode } from 'react';
import RootClientLayout from './layout-client';
import Layout from '@/components/layout';
import './globals.css';

type Properties = PropsWithChildren & {
  sidebar: ReactNode;
};

export default async function RootLayout({ children, sidebar }: Properties) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return <RootClientLayout>{children}</RootClientLayout>;
  }

  return (
    <RootClientLayout>
      <Layout sidebar={sidebar}>{children}</Layout>
    </RootClientLayout>
  );
}
