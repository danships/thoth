'use client';

import { Alert, ActionIcon, Loader, Stack, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { markDragEnded } from '@/lib/dnd/suppress-click-after-drag';
import { usePagesByParent } from '@/lib/hooks/api/use-pages';
import { useReorderPage } from '@/lib/hooks/api/use-reorder-page';
import { useNotification } from '@/lib/hooks/use-notification';
import { usePageUrl } from '@/lib/hooks/use-page-url';
import type { GetPagesResponse } from '@/types/api';
import styles from './page-subpages-list.module.css';

type PageSubpagesListProperties = {
  pageId: string;
};

type SubpageRowProperties = {
  page: GetPagesResponse[number]['page'];
  dragDisabled?: boolean;
};

function SubpageRow({ page, dragDisabled = false }: SubpageRowProperties) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: dragDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { zIndex: 1, position: 'relative' as const, background: 'var(--mantine-color-body)' }),
  };
  const getPageUrl = usePageUrl();

  return (
    <div ref={setNodeRef} style={style} className={styles['row'] ?? ''}>
      <ActionIcon
        variant="subtle"
        size="xs"
        aria-label="Reorder page"
        data-testid={`subpage-drag-handle-${page.id}`}
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab' }}
      >
        <IconGripVertical size={14} />
      </ActionIcon>
      <Link
        href={getPageUrl(page)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', flex: 1 }}
      >
        <span>{page.emoji ?? '📄'}</span>
        <Text size="sm">{page.name}</Text>
      </Link>
    </div>
  );
}

// Presentational list of a page's direct child pages (THOTH-034), rendered inside the
// "Sub Pages" tab. Fetches lazily via `usePagesByParent`, which is only mounted once that tab
// is active (see the page-detail component), so no request fires until the user opens it.
// THOTH-036: drag-and-drop reordering — optimistically reorders the SWR cache and persists via
// `api.pages.reorder` (through `useReorderPage`), rolling back on failure.
export function PageSubpagesList({ pageId }: PageSubpagesListProperties) {
  const { data, error, isLoading, mutate } = usePagesByParent(pageId);
  const { reorderPage } = useReorderPage();
  const { showError } = useNotification();

  // Serializes reorder mutations: a drop while a previous `reorderPage` call is still in flight
  // is ignored (rather than kicking off a second concurrent request), and a stale failure only
  // rolls back to `previousChildren` if no newer mutation has started since (tracked via
  // `reorderTokenReference`) — otherwise an earlier failure could clobber a later, already-applied
  // reorder with its own (now outdated) rollback snapshot.
  const [isReordering, setIsReordering] = useState(false);
  const reorderTokenReference = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (isLoading) {
    return <Loader />;
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        Failed to load sub pages.
      </Alert>
    );
  }

  const children = data ?? [];

  if (children.length === 0) {
    return <Text c="dimmed">No sub pages yet.</Text>;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    markDragEnded();
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    if (isReordering) {
      // A previous reorder is still in flight — ignore this drop rather than starting a second
      // concurrent mutation that could race the first one's rollback/success.
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    const previousChildren = children;
    const oldIndex = previousChildren.findIndex(({ page }) => page.id === activeId);
    const newIndex = previousChildren.findIndex(({ page }) => page.id === overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reordered = [...previousChildren];
    const [moved] = reordered.splice(oldIndex, 1);
    if (!moved) {
      return;
    }
    reordered.splice(newIndex, 0, moved);

    const movedNewIndex = reordered.findIndex(({ page }) => page.id === activeId);
    const beforeId = reordered[movedNewIndex - 1]?.page.id ?? null;
    const afterId = reordered[movedNewIndex + 1]?.page.id ?? null;

    void mutate(reordered, { revalidate: false });

    const token = ++reorderTokenReference.current;
    setIsReordering(true);

    reorderPage(activeId, { beforeId, afterId })
      .catch((reorderError) => {
        // Only roll back if this is still the most recent mutation — an older failure must not
        // clobber a newer, already-applied reorder.
        if (reorderTokenReference.current === token) {
          void mutate(previousChildren, { revalidate: false });
        }
        showError(reorderError instanceof Error ? reorderError.message : 'Failed to reorder page');
      })
      .finally(() => {
        if (reorderTokenReference.current === token) {
          setIsReordering(false);
        }
      });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map(({ page }) => page.id)} strategy={verticalListSortingStrategy}>
        <Stack gap={0}>
          {children.map(({ page }) => (
            <SubpageRow key={page.id} page={page} dragDisabled={isReordering} />
          ))}
        </Stack>
      </SortableContext>
    </DndContext>
  );
}
