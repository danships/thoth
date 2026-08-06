import { apiRoute } from '@/lib/api/route-wrapper';
import { isPlatformAdmin } from '@/lib/auth/platform-user';
import { canCreateWorkspace } from '@/lib/settings/workspace-policy';
import type { GetPlatformCapabilitiesResponse } from '@/types/api';

// `GET /api/v1/platform/capabilities` — human cookie sessions only. Tells the frontend whether to
// show platform-admin entry points and whether the "New workspace" affordance should be visible
// (THOTH-045). Never exposes any workspace content — purely a capability probe.
export const GET = apiRoute<GetPlatformCapabilitiesResponse, {}, {}, {}>(
  {
    disallowApiKey: true,
  },
  async (_request, session) => {
    const [isAdmin, canCreate] = await Promise.all([isPlatformAdmin(session.user.id), canCreateWorkspace(session)]);

    return {
      isPlatformAdmin: isAdmin,
      canCreateWorkspace: canCreate,
    };
  }
);
