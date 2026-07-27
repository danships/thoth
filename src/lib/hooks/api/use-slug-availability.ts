'use client';

import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { workspaceSlugSchema } from '@/types/schemas/entities/workspace';

export type SlugAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'unchanged' | 'invalid';

type UseSlugAvailabilityOptions = {
  // When set (in the rename/settings flow), the workspace's own current slug is excluded from
  // the collision check and reported as `unchanged` rather than `taken`.
  currentSlug?: string;
  excludeWorkspaceId?: string;
};

/**
 * Debounced live availability check for a workspace slug, shared by the creation and
 * rename/settings forms. Returns a single `availability` state machine plus a `isBlocking`
 * convenience flag (true when the current input can't be submitted — taken or malformed).
 */
export function useSlugAvailability(
  slug: string,
  options: UseSlugAvailabilityOptions = {}
): { availability: SlugAvailability; isBlocking: boolean } {
  const { currentSlug, excludeWorkspaceId } = options;
  const [debouncedSlug] = useDebouncedValue(slug, 400);

  // Keyed by the slug it was resolved for, so a stale in-flight result is never shown for a
  // slug the user has since changed.
  const [result, setResult] = useState<{ slug: string; available: boolean } | null>(null);

  const isEmpty = debouncedSlug.trim().length === 0;
  const isUnchanged = currentSlug !== undefined && debouncedSlug === currentSlug;
  const formatValid = workspaceSlugSchema.safeParse(debouncedSlug).success;
  const shouldCheck = !isEmpty && !isUnchanged && formatValid;

  useEffect(() => {
    if (!shouldCheck) {
      return;
    }

    let cancelled = false;
    api.workspaces
      .checkSlugAvailability(debouncedSlug, excludeWorkspaceId)
      .then((response) => {
        if (!cancelled) {
          setResult({ slug: debouncedSlug, available: response.data.data.available });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, excludeWorkspaceId, shouldCheck]);

  let availability: SlugAvailability;
  if (isEmpty) {
    availability = 'idle';
  } else if (isUnchanged) {
    availability = 'unchanged';
  } else if (!formatValid) {
    availability = 'invalid';
  } else if (result?.slug === debouncedSlug) {
    availability = result.available ? 'available' : 'taken';
  } else {
    availability = 'checking';
  }

  return { availability, isBlocking: availability === 'taken' || availability === 'invalid' };
}
