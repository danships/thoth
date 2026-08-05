import { ActionIcon, Box, Menu, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useStore } from '@nanostores/react';
import { IconDots, IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import { computed } from 'nanostores';
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
import { $expandedPages, togglePageExpanded } from '@/lib/store/tree-expanded-state';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { useNotification } from '@/lib/hooks/use-notification';
import { usePageUrl } from '@/lib/hooks/use-page-url';
import { TreeItem } from '../atoms/tree-item';
import { TreeToggle } from '../atoms/tree-toggle';

type TreeNodeProperties = {
  page: {
    id: string;
    name: string;
    emoji?: string | null;
  };
  childPages?: Array<{
    page: {
      id: string;
      name: string;
      emoji?: string | null;
    };
  }>;
  // Set when the page has more children than the small inline preview allows (see
  // CHILD_PREVIEW_LIMIT). Child-listing pagination is out of scope for this ticket, so this
  // is a static indicator only — no additional fetching is triggered by scrolling/interacting.
  hasMoreChildren?: boolean;
  views?: Array<{
    id: string;
    name: string;
  }>;
  level?: number;
  parentPageId?: string;
  // The parent page's name, only meaningful alongside `parentPageId` for a view node (`isView`)
  // — used to build a title-slugged link back to the parent page (THOTH-067). Absent for a
  // regular child page node, whose own `page.name` is used instead.
  parentPageName?: string;
  isView?: boolean;
  onDelete?: (item: { id: string; name: string; isView: boolean; parentPageId?: string }) => Promise<void>;
  // Manual reordering (THOTH-036). Only child pages within an *expanded* parent node are
  // draggable — root branches stay permanently out of scope (see spec). `dragHandle` renders
  // this node itself as a sortable item (used when this TreeNode instance is one of the child
  // pages rendered inside a parent's SortableContext); `onReorderChildren` is provided by the
  // parent node to persist a reorder of *its own* children.
  dragHandle?: boolean;
  // Set by the parent while a previous `onReorderChildren` mutation for one of its children is
  // still in flight, so a fresh drag can't be started on top of it (see `isReordering` above).
  dragDisabled?: boolean;
  onReorderChildren?: (
    parentId: string,
    movedId: string,
    beforeId: string | null,
    afterId: string | null
  ) => Promise<void>;
};

export function TreeNode({
  page,
  childPages = [],
  hasMoreChildren = false,
  views = [],
  level = 0,
  parentPageId,
  parentPageName,
  isView,
  onDelete,
  dragHandle = false,
  dragDisabled = false,
  onReorderChildren,
}: TreeNodeProperties) {
  const $isExpanded = computed($expandedPages, (expandedPages) => expandedPages.get(page.id) ?? false);

  const isExpanded = useStore($isExpanded);
  const { slug: workspaceSlug } = useCurrentWorkspace();
  const { showError } = useNotification();
  const getPageUrl = usePageUrl();

  const hasChildren = childPages.length > 0 || views.length > 0;

  // Local optimistic order of child page ids — reset whenever the parent hands us a fresh
  // `childPages` array (e.g. after a successful reorder revalidates the tree).
  const [childOrder, setChildOrder] = useState(() => childPages.map((child) => child.page.id));
  const [previousChildPages, setPreviousChildPages] = useState(childPages);
  if (childPages !== previousChildPages) {
    setPreviousChildPages(childPages);
    setChildOrder(childPages.map((child) => child.page.id));
  }

  // Serializes reorder mutations: a drop while a previous `onReorderChildren` call is still in
  // flight is ignored (rather than kicking off a second concurrent request), and a stale
  // failure only rolls back `childOrder` if no newer mutation has started since (tracked via
  // `reorderTokenReference`) — otherwise an earlier failure could clobber a later, already-applied
  // reorder with its own (now outdated) rollback snapshot.
  const [isReordering, setIsReordering] = useState(false);
  const reorderTokenReference = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedChildPages = childOrder
    .map((id) => childPages.find((child) => child.page.id === id))
    // eslint-disable-next-line unicorn/prefer-native-coercion-functions -- needs a type predicate to narrow away `undefined`, not just a runtime Boolean check
    .filter((child): child is NonNullable<typeof child> => Boolean(child));

  const handleChildDragEnd = (event: DragEndEvent) => {
    markDragEnded();
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderChildren) {
      return;
    }
    if (isReordering) {
      // A previous reorder is still in flight — ignore this drop rather than starting a second
      // concurrent mutation that could race the first one's rollback/success.
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    const oldIndex = childOrder.indexOf(activeId);
    const newIndex = childOrder.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const previousOrder = childOrder;
    const reordered = [...childOrder];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, activeId);
    setChildOrder(reordered);

    const movedIndex = reordered.indexOf(activeId);
    const beforeId = reordered[movedIndex - 1] ?? null;
    const afterId = reordered[movedIndex + 1] ?? null;

    const token = ++reorderTokenReference.current;
    setIsReordering(true);

    onReorderChildren(page.id, activeId, beforeId, afterId)
      .catch((reorderError) => {
        // Only roll back if this is still the most recent mutation — an older failure must not
        // clobber a newer, already-applied reorder.
        if (reorderTokenReference.current === token) {
          setChildOrder(previousOrder);
        }
        showError(reorderError instanceof Error ? reorderError.message : 'Failed to reorder page');
      })
      .finally(() => {
        if (reorderTokenReference.current === token) {
          setIsReordering(false);
        }
      });
  };

  const handleToggle = () => {
    togglePageExpanded(page.id);
  };

  const handleDelete = () => {
    if (!onDelete) {
      return;
    }

    modals.openConfirmModal({
      title: isView ? 'Delete view' : 'Delete page',
      children: (
        <Text size="sm">
          {isView ? `Move "${page.name}" to Trash?` : `Move "${page.name}" and any nested content to Trash?`}
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        void onDelete({
          id: page.id,
          name: page.name,
          isView: Boolean(isView),
          ...(parentPageId ? { parentPageId } : {}),
        }),
    });
  };

  // Determine the link URL - if this is a view, link to parent page (using its name for the
  // slug, since `page` here refers to the view itself) with the view query param
  const getTreeItemUrl = () => {
    if (isView && parentPageId) {
      return `${getPageUrl({ id: parentPageId, name: parentPageName })}?v=${page.id}`;
    }
    return getPageUrl(page);
  };

  // Only meaningful when this node is itself a sortable child page (`dragHandle`) — `useSortable`
  // is safe to call unconditionally (a no-op outside a `SortableContext`), so hooks rules stay
  // satisfied without conditionally invoking it.
  const sortable = useSortable({ id: page.id, disabled: !dragHandle || dragDisabled });
  const rowStyle = dragHandle
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        ...(sortable.isDragging && {
          zIndex: 1,
          position: 'relative' as const,
          background: 'var(--mantine-color-body)',
        }),
      }
    : undefined;

  return (
    <Box ref={dragHandle ? sortable.setNodeRef : undefined} style={rowStyle}>
      {/* Current page row */}
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: level * 20,
        }}
      >
        {dragHandle && (
          <ActionIcon
            variant="subtle"
            size="xs"
            aria-label="Reorder page"
            data-testid={`tree-drag-handle-${page.id}`}
            {...sortable.attributes}
            {...sortable.listeners}
            style={{ cursor: 'grab' }}
          >
            <IconGripVertical size={12} />
          </ActionIcon>
        )}
        <TreeToggle isExpanded={isExpanded} onToggle={handleToggle} hasChildren={hasChildren} />
        <TreeItem name={page.name} emoji={page.emoji ?? null} to={getTreeItemUrl()} />
        <Box style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          {level === 0 && !isView && (
            <ActionIcon
              variant="subtle"
              size="xs"
              component={Link}
              href={`/${workspaceSlug}/pages/${page.id}/create`}
              aria-label="Add child page"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <IconPlus size={12} />
            </ActionIcon>
          )}
          {onDelete && (
            <Menu shadow="md" width={180} position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  aria-label={isView ? 'View actions' : 'Page actions'}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <IconDots size={12} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete();
                  }}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Box>
      </Box>

      {/* Views (shown as children when expanded) */}
      {isExpanded && views.length > 0 && (
        <Box>
          {views.map((view) => (
            <TreeNode
              key={view.id}
              page={{
                id: view.id,
                name: view.name,
                emoji: null,
              }}
              childPages={[]}
              views={[]}
              level={level + 1}
              parentPageId={page.id}
              parentPageName={page.name}
              isView={true}
              {...(onDelete ? { onDelete } : {})}
            />
          ))}
        </Box>
      )}

      {/* Children (actual child pages) — sortable when the parent supplied `onReorderChildren`
          (root branches never do, keeping root-level ordering permanently out of scope). */}
      {isExpanded && childPages.length > 0 && (
        <Box>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChildDragEnd}>
            <SortableContext items={childOrder} strategy={verticalListSortingStrategy}>
              {orderedChildPages.map((child) => (
                <TreeNode
                  key={child.page.id}
                  page={{
                    id: child.page.id,
                    name: child.page.name,
                    emoji: child.page.emoji ?? null,
                  }}
                  childPages={[]}
                  views={[]}
                  level={level + 1}
                  parentPageId={page.id}
                  dragHandle={Boolean(onReorderChildren)}
                  dragDisabled={isReordering}
                  {...(onDelete ? { onDelete } : {})}
                />
              ))}
            </SortableContext>
          </DndContext>
          {hasMoreChildren && (
            <Box style={{ paddingLeft: (level + 1) * 20 + 24 }}>
              <Text
                component={Link}
                href={getPageUrl(page)}
                size="xs"
                c="dimmed"
                style={{ display: 'block', textDecoration: 'none' }}
              >
                More inside — open page
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
