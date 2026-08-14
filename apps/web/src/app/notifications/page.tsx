import type { Metadata } from 'next';
import { Container } from '@mantine/core';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { NotificationInbox } from '@/components/molecules/notification-inbox';

export const metadata: Metadata = { title: 'Notifications' };

// The global inbox across every workspace the caller is currently a member of (THOTH-066).
// `withAuthPage` gates the route on a valid session; the list itself is scoped to the caller's
// own memberships server-side.
function NotificationsIndexPage() {
  return (
    <Container size="md" py="md">
      <NotificationInbox />
    </Container>
  );
}

export default withAuthPage(NotificationsIndexPage);
