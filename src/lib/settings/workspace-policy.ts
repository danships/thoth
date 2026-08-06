import type { ApiKeySession } from '@/lib/auth/session';
import { isPlatformAdmin } from '@/lib/auth/platform-user';
import { getSetting } from './service';
import { WORKSPACE_CREATION_SELF_SERVICE_KEY } from './definitions';

/**
 * Whether self-service creation of additional workspaces is currently enabled platform-wide
 * (THOTH-045). This is the raw platform policy, independent of who is asking.
 */
export async function isSelfServiceWorkspaceCreationEnabled(): Promise<boolean> {
  return getSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'platform' });
}

/**
 * Whether the given caller may create an additional workspace via `POST /api/v1/workspaces`.
 * True when the platform policy allows self-service creation OR the caller is a platform admin
 * (admins may always create their own workspaces even when self-service is disabled).
 */
export async function canCreateWorkspace(session: ApiKeySession): Promise<boolean> {
  if (await isSelfServiceWorkspaceCreationEnabled()) {
    return true;
  }
  // App/bearer sessions are never platform admins (there's no human behind them); admin routes
  // and this policy require a genuine cookie session.
  if (session.appContext) {
    return false;
  }
  return isPlatformAdmin(session.user.id);
}
