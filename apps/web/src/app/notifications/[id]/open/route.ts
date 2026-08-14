import { type NextRequest, NextResponse } from 'next/server';
import { grantAllowsContainer, memberToAccessGrant } from '@thoth/database';
import { getSessionFromCookie } from '@/lib/auth/session';
import {
  getContainerRepository,
  getNotificationRepository,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
} from '@/lib/database';
import { buildPageUrlId } from '@/lib/utils/page-url';
import { getLogger } from '@/lib/logger';

// Plain Next.js route handler (NOT wrapped by `apiRoute`, NOT under `/api`) that powers the
// `openUrl` on every inbox item (THOTH-066). It resolves the session from the request cookie,
// verifies the caller owns the notification, re-checks current membership + `AccessGrant` on the
// page, marks the item read (idempotently), and 303-redirects to the in-app page. It NEVER
// returns a 500 and NEVER leaks existence — any failure falls through to a safe internal
// redirect. Every redirect target is an internal relative path (never built from user input).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const redirectTo = (path: string): Response => NextResponse.redirect(new URL(path, request.url), 303);

  try {
    const session = await getSessionFromCookie(request.headers);
    if (!session) {
      return redirectTo('/login');
    }

    const { id } = await params;

    const notificationRepository = await getNotificationRepository();
    const notification = await notificationRepository.getOneByQuery(notificationRepository.createQuery().eq('id', id));

    // Unknown item or not the caller's — never leak existence, just bounce to the inbox.
    if (!notification || notification.userId !== session.user.id) {
      return redirectTo('/notifications');
    }

    const markReadBestEffort = async (): Promise<void> => {
      if (notification.readAt === null) {
        try {
          await notificationRepository.update({ ...notification, readAt: new Date().toISOString() });
        } catch (error) {
          const logger = await getLogger();
          logger.error('notifications.open.mark-read-failed', { notificationId: notification.id, error });
        }
      }
    };

    // Resolve the workspace slug for a workspace-scoped fallback inbox URL where possible.
    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      workspaceRepository.createQuery().eq('id', notification.workspaceId)
    );
    const workspaceInboxUrl = workspace && !workspace.deletedAt ? `/${workspace.slug}/notifications` : '/notifications';

    // Membership re-check (revoked membership loses access to the item's target).
    const workspaceMemberRepository = await getWorkspaceMemberRepository();
    const member = await workspaceMemberRepository.getOneByQuery(
      workspaceMemberRepository.createQuery().eq('workspaceId', notification.workspaceId).eq('userId', session.user.id)
    );
    if (!member || !workspace || workspace.deletedAt) {
      await markReadBestEffort();
      return redirectTo(workspaceInboxUrl);
    }

    // Load the live page and re-check the per-container grant.
    const containerRepository = await getContainerRepository();
    const page = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', notification.containerId).eq('type', 'page')
    );
    if (!page || page.type !== 'page' || page.deletedAt) {
      await markReadBestEffort();
      return redirectTo(workspaceInboxUrl);
    }

    const grant = await memberToAccessGrant(member);
    const allowed = await grantAllowsContainer(grant, { id: page.id, workspaceId: page.workspaceId });
    if (!allowed) {
      await markReadBestEffort();
      return redirectTo(workspaceInboxUrl);
    }

    await markReadBestEffort();
    return redirectTo(`/${workspace.slug}/pages/${buildPageUrlId(page.id, page.name)}`);
  } catch (error) {
    const logger = await getLogger();
    logger.error('notifications.open.unexpected-error', { error });
    return redirectTo('/notifications');
  }
}
