import { Badge, Tooltip } from '@mantine/core';
import type { SelectColor } from '@/types/schemas/entities/container';

type SelectOptionBadgeProperties = {
  label: string;
  color: SelectColor;
};

/**
 * Renders a single-select option as a colored Mantine Badge. Shared by the table cell (read
 * state), the dropdown option list, and PageFieldsEditor so the visual representation of an
 * option only lives in one place.
 */
export function SelectOptionBadge({ label, color }: SelectOptionBadgeProperties) {
  return (
    <Tooltip label={label} openDelay={400}>
      <Badge color={color} variant="light" radius="sm" style={{ maxWidth: '100%' }}>
        {label}
      </Badge>
    </Tooltip>
  );
}
