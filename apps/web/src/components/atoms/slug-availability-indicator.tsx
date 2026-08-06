'use client';

import { Badge, Loader } from '@mantine/core';
import type { SlugAvailability } from '@/lib/hooks/api/use-slug-availability';

// Shared right-section indicator for workspace-slug inputs (creation and settings forms).
export function SlugAvailabilityIndicator({ availability }: { availability: SlugAvailability }) {
  if (availability === 'checking') {
    return <Loader size="xs" />;
  }
  if (availability === 'available') {
    return (
      <Badge color="teal" size="xs">
        Available
      </Badge>
    );
  }
  if (availability === 'taken') {
    return (
      <Badge color="red" size="xs">
        Taken
      </Badge>
    );
  }
  return null;
}
