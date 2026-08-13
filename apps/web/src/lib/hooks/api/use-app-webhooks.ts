import useSWR from 'swr';
import type { GetWebhookDeliveriesResponse, GetWebhooksResponse, WebhookDeliveryResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

const ACTIVE_STATUSES = new Set<WebhookDeliveryResponse['status']>(['pending', 'retrying']);
// Poll every 2s while any delivery is in-flight — stops automatically once every row is
// terminal (THOTH-061 manual resend/dispatch is asynchronous, so the UI can't rely on the
// resend response body reflecting the final outcome).
const ACTIVE_POLL_INTERVAL_MS = 2000;

export function useAppWebhooks(appId: string | undefined) {
  return useSWR<GetWebhooksResponse>(appId ? `/apps/${appId}/webhooks` : null, swrFetcher);
}

export function useWebhookDeliveries(appId: string | undefined, webhookId: string | undefined) {
  return useSWR<GetWebhookDeliveriesResponse>(
    appId && webhookId ? `/apps/${appId}/webhooks/${webhookId}/deliveries` : null,
    swrFetcher,
    {
      // Always poll while a webhook's deliveries are open (THOTH-061 dispatch/resend are
      // asynchronous — a fresh page mutation or a manual resend can create/update a row well
      // after the initial fetch, including going from zero rows to one). Only slow down once
      // every currently-known delivery is terminal, so a long-idle view with only finished
      // rows doesn't keep polling forever.
      refreshInterval: (data) =>
        !data ||
        data.deliveries.length === 0 ||
        data.deliveries.some((delivery) => ACTIVE_STATUSES.has(delivery.status))
          ? ACTIVE_POLL_INTERVAL_MS
          : 0,
    }
  );
}
