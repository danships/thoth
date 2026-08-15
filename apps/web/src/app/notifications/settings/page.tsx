import type { Metadata } from 'next';
import { Container } from '@mantine/core';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { NotificationSettingsPageContent } from '@/components/molecules/notification-settings-page-content';

export const metadata: Metadata = { title: 'Notification settings' };

// Cross-workspace notification-settings screen (THOTH-072): quiet-window schedule, timezone,
// and mute controls. Lives outside any `[workspaceSlug]` scope, like `/notifications` itself,
// since a user's timezone/quiet-schedule/mute state applies across every workspace they belong
// to. `withAuthPage` gates the route on a valid session.
function NotificationSettingsPage() {
  return (
    <Container size="md" py="md">
      <NotificationSettingsPageContent />
    </Container>
  );
}

export default withAuthPage(NotificationSettingsPage);
