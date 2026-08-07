import { z } from 'zod';
import type { DataWrapper } from '../utilities';

// `GET /platform/capabilities` — a lightweight, human-cookie-only endpoint the frontend polls to
// decide what platform-level UI to show (THOTH-045). `canCreateWorkspace` is true when the
// platform policy allows self-service creation OR the caller is a platform admin.
export const GET_PLATFORM_CAPABILITIES_ENDPOINT = '/platform/capabilities';

export const getPlatformCapabilitiesResponseSchema = z.object({
  isPlatformAdmin: z.boolean(),
  canCreateWorkspace: z.boolean(),
});
export type GetPlatformCapabilitiesResponse = z.infer<typeof getPlatformCapabilitiesResponseSchema>;
export type GetPlatformCapabilitiesResponseData = DataWrapper<GetPlatformCapabilitiesResponse>;
