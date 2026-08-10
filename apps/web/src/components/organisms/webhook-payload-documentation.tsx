import { Accordion, Code, List, Stack, Text } from '@mantine/core';

// Static reference examples shown in the "manage keys" UI so App owners know what to expect on
// the receiving end before they wire up a webhook. Kept in sync by hand with the shape produced
// by `buildPayload` (`src/lib/webhooks/build-payload.ts`) — update both if the payload changes.
const PLAIN_PAGE_EXAMPLE = `{
  "event": "page.updated",
  "deliveryId": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "timestamp": "2024-06-01T12:34:56.000Z",
  "workspaceId": "ws_123",
  "appId": "app_456",
  "page": {
    "id": "pg_789",
    "name": "Release notes",
    "parentId": null,
    "type": "page",
    "lastUpdated": "2024-06-01T12:34:56.000Z"
  }
}`;

const DATA_SOURCE_ROW_EXAMPLE = `{
  "event": "page.updated",
  "deliveryId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "timestamp": "2024-06-01T12:40:00.000Z",
  "workspaceId": "ws_123",
  "appId": "app_456",
  "page": {
    "id": "row_001",
    "name": "Acme Corp",
    "parentId": "ds_customers",
    "type": "page",
    "lastUpdated": "2024-06-01T12:40:00.000Z"
  },
  "dataSourceId": "ds_customers",
  "values": {
    "Status": "Active",
    "MRR": 1200,
    "Renewed": true
  },
  "changes": {
    "Status": { "previous": "Trial", "new": "Active" }
  }
}`;

// Explains the outbound webhook contract to App owners: request shape, headers, and two payload
// examples (a plain page and a data-source row with column values/changes).
export function WebhookPayloadDocumentation() {
  return (
    <Accordion variant="contained">
      <Accordion.Item value="payload-format">
        <Accordion.Control>
          <Text size="sm" fw={500}>
            What does a webhook payload look like?
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Text size="sm">
              Every event is sent as a single <Code>POST</Code> request with a JSON body and these headers:
            </Text>
            <List size="sm" spacing={4}>
              <List.Item>
                <Code>X-Thoth-Event</Code> — the event name (<Code>page.created</Code> or <Code>page.updated</Code>),
                matching <Code>event</Code> in the body.
              </List.Item>
              <List.Item>
                <Code>X-Thoth-Signature</Code> — <Code>sha256=&lt;hmac&gt;</Code>, an HMAC-SHA256 of the raw request
                body using the webhook&apos;s secret. Verify this before trusting the payload.
              </List.Item>
            </List>

            <Text size="sm">
              <Code>page</Code> is always present. <Code>dataSourceId</Code>, <Code>values</Code> and{' '}
              <Code>changes</Code> are only included when the page is a row inside a data source — plain pages never
              have them. <Code>values</Code>/<Code>changes</Code> are keyed by column <em>name</em>, and{' '}
              <Code>changes</Code> only lists columns whose value actually changed.
            </Text>

            <Text size="sm" fw={500}>
              Plain page (created or updated)
            </Text>
            <Code block>{PLAIN_PAGE_EXAMPLE}</Code>

            <Text size="sm" fw={500}>
              Data-source row, with column values and changes
            </Text>
            <Code block>{DATA_SOURCE_ROW_EXAMPLE}</Code>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
