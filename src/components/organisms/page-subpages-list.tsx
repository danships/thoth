'use client';

import { Alert, ActionIcon, Loader, Stack, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import Link from 'next/link';
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
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import type { GetPagesResponse } from '@/types/api';
import styles from './page-subpages-list.module.css';

type PageSubpagesListProperties = {
  pageId: string;
};

type SubpageRowProperties = {
  page: GetPagesResponse[number]['page'];
  workspaceSlug: string;
};

function SubpageRow({ page, workspaceSlug }: SubpageRowProperties) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { zIndex: 1, position: 'relative' as const, background: 'var(--mantine-color-body)' }),
  };

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
        href={`/${workspaceSlug}/pages/${page.id}`}
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
  const { slug: workspaceSlug } = useCurrentWorkspace();
  const { reorderPage } = useReorderPage();
  const { showError } = useNotification();

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

    reorderPage(activeId, { beforeId, afterId }).catch((reorderError) => {
      void mutate(previousChildren, { revalidate: false });
      showError(reorderError instanceof Error ? reorderError.message : 'Failed to reorder page');
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map(({ page }) => page.id)} strategy={verticalListSortingStrategy}>
        <Stack gap={0}>
          {children.map(({ page }) => (
            <SubpageRow key={page.id} page={page} workspaceSlug={workspaceSlug} />
          ))}
        </Stack>
      </SortableContext>
    </DndContext>
  );
}
