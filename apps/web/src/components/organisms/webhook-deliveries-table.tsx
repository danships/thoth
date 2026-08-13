'use client';

import { ActionIcon, Badge, Table, Text, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import type { WebhookDeliveryResponse } from '@/types/api';

type WebhookDeliveriesTableProperties = {
  deliveries: WebhookDeliveryResponse[];
  onResend: (deliveryId: string) => Promise<void>;
};

const ACTIVE_STATUSES = new Set<WebhookDeliveryResponse['status']>(['pending', 'retrying']);

/** Status badge for one delivery row (THOTH-061 expands the status union to include the
 * in-flight `pending`/`retrying` states alongside the terminal ones). */
function DeliveryStatusBadge({ delivery }: { delivery: WebhookDeliveryResponse }) {
  switch (delivery.status) {
    case 'pending': {
      return (
        <Badge color="blue" variant="light">
          Pending
        </Badge>
      );
    }
    case 'retrying': {
      return (
        <Tooltip
          label={
            delivery.nextAttemptAt ? `Next attempt ${new Date(delivery.nextAttemptAt).toLocaleString()}` : 'Retrying'
          }
        >
          <Badge color="yellow" variant="light">
            Retrying
          </Badge>
        </Tooltip>
      );
    }
    case 'success': {
      return (
        <Badge color="teal" variant="light">
          Success{delivery.httpStatus ? ` (${delivery.httpStatus})` : ''}
        </Badge>
      );
    }
    case 'cancelled': {
      return (
        <Tooltip label={delivery.error ?? 'Webhook was disabled or removed before delivery'}>
          <Badge color="gray" variant="light">
            Cancelled
          </Badge>
        </Tooltip>
      );
    }
    default: {
      return (
        <Tooltip label={delivery.error ?? 'Delivery failed'}>
          <Badge color="red" variant="light">
            Failed{delivery.httpStatus ? ` (${delivery.httpStatus})` : ''}
          </Badge>
        </Tooltip>
      );
    }
  }
}

// Per-webhook delivery history — up to the newest 25 *terminal* rows plus any in-flight ones
// (server-capped). Follows the `apps-table.tsx` styling; each row exposes a Resend button that
// asynchronously replays the stored payload verbatim (see
// `POST /apps/:id/webhooks/:webhookId/deliveries/:deliveryId/resend`, THOTH-061) — disabled
// while the row is already `pending`/`retrying` so a click can never race a running attempt.
export function WebhookDeliveriesTable({ deliveries, onResend }: WebhookDeliveriesTableProperties) {
  const [resendingId, setResendingId] = useState<string | undefined>(undefined);

  const handleResend = async (deliveryId: string) => {
    setResendingId(deliveryId);
    try {
      await onResend(deliveryId);
    } finally {
      setResendingId(undefined);
    }
  };

  if (deliveries.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No deliveries yet.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={500} type="native">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Event</Table.Th>
            <Table.Th>Page</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Attempts</Table.Th>
            <Table.Th>Last attempt</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {deliveries.map((delivery) => {
            const isActive = ACTIVE_STATUSES.has(delivery.status);
            return (
              <Table.Tr key={delivery.id}>
                <Table.Td>{delivery.event}</Table.Td>
                <Table.Td>
                  <code>{delivery.containerId}</code>
                </Table.Td>
                <Table.Td>
                  <DeliveryStatusBadge delivery={delivery} />
                </Table.Td>
                <Table.Td>{delivery.attempts}</Table.Td>
                <Table.Td>{delivery.lastAttemptAt ? new Date(delivery.lastAttemptAt).toLocaleString() : '—'}</Table.Td>
                <Table.Td>
                  <Tooltip label={isActive ? 'Delivery already in progress' : 'Resend'}>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Resend delivery"
                      loading={resendingId === delivery.id}
                      data-disabled={isActive}
                      onClick={(event) => {
                        if (isActive) {
                          event.preventDefault();
                          return;
                        }
                        handleResend(delivery.id);
                      }}
                    >
                      <IconRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
