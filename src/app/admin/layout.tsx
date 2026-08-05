import type { PropsWithChildren } from 'react';
import type { Metadata } from 'next';
import { withPlatformAdminPage } from '@/lib/auth/with-platform-admin-page';
import { AdminNav } from './admin-nav';

export const metadata: Metadata = { title: 'Platform administration' };

function AdminLayout({ children }: PropsWithChildren) {
  return <AdminNav>{children}</AdminNav>;
}

export default withPlatformAdminPage(AdminLayout);
