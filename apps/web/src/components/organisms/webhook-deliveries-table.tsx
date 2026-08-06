'use client';

import { ActionIcon, Badge, Table, Text, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import type { WebhookDeliveryResponse } from '@/types/api';

type WebhookDeliveriesTableProperties = {
  deliveries: WebhookDeliveryResponse[];
  onResend: (deliveryId: string) => Promise<void>;
};

// Per-webhook delivery history — up to the newest 25 rows (server-capped). Follows the
// `apps-table.tsx` styling; each row exposes a Resend button that replays the stored payload
// verbatim (see `POST /apps/:id/webhooks/:webhookId/deliveries/:deliveryId/resend`).
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
          {deliveries.map((delivery) => (
            <Table.Tr key={delivery.id}>
              <Table.Td>{delivery.event}</Table.Td>
              <Table.Td>
                <code>{delivery.containerId}</code>
              </Table.Td>
              <Table.Td>
                {delivery.status === 'success' ? (
                  <Badge color="teal" variant="light">
                    Success{delivery.httpStatus ? ` (${delivery.httpStatus})` : ''}
                  </Badge>
                ) : (
                  <Tooltip label={delivery.error ?? 'Delivery failed'}>
                    <Badge color="red" variant="light">
                      Failed{delivery.httpStatus ? ` (${delivery.httpStatus})` : ''}
                    </Badge>
                  </Tooltip>
                )}
              </Table.Td>
              <Table.Td>{delivery.attempts}</Table.Td>
              <Table.Td>{new Date(delivery.lastAttemptAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <Tooltip label="Resend">
                  <ActionIcon
                    variant="subtle"
                    aria-label="Resend delivery"
                    loading={resendingId === delivery.id}
                    onClick={() => handleResend(delivery.id)}
                  >
                    <IconRefresh size={16} />
                  </ActionIcon>
                </Tooltip>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
