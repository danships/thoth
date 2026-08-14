import { apiRoute } from '@/lib/api/route-wrapper';
import { getPublicVapidKey } from '@/lib/notifications/vapid';
import { getEnvironment } from '@/lib/environment';
import type { GetPushConfigResponse } from '@/types/api';

// Returns whether Web Push is enabled at this deployment, plus the public VAPID key browsers
// need to subscribe (THOTH-071). Never returns the private key. When push is disabled, both
// fields resolve to their disabled values (`enabled: false`, `publicKey: null`) so the client
// can render an informative state without a separate request.
export const GET = apiRoute<GetPushConfigResponse, {}, {}, {}>({ disallowApiKey: true }, async () => {
  const environment = await getEnvironment();
  if (!environment.WEB_PUSH_ENABLED) {
    return { enabled: false, publicKey: null };
  }
  const publicKey = await getPublicVapidKey();
  return { enabled: true, publicKey };
});
