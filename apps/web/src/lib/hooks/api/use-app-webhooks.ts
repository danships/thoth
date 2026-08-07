import useSWR from 'swr';
import type { GetWebhookDeliveriesResponse, GetWebhooksResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function useAppWebhooks(appId: string | undefined) {
  return useSWR<GetWebhooksResponse>(appId ? `/apps/${appId}/webhooks` : null, swrFetcher);
}

export function useWebhookDeliveries(appId: string | undefined, webhookId: string | undefined) {
  return useSWR<GetWebhookDeliveriesResponse>(
    appId && webhookId ? `/apps/${appId}/webhooks/${webhookId}/deliveries` : null,
    swrFetcher
  );
}
