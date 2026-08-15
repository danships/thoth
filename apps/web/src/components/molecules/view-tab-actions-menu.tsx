'use client';

import { ActionIcon, Menu } from '@mantine/core';
import { IconCopy, IconDots } from '@tabler/icons-react';

type ViewTabActionsMenuProperties = {
  viewName: string;
  onDuplicate: () => void;
  duplicating?: boolean;
};

// Deliberately subtle (THOTH-073): only rendered by the caller for the *currently open*
// view's tab (see PageDetailsPage), and styled identically to the low-emphasis "..." kebab
// already used for page/view actions in the sidebar tree (TreeNode) — not a prominent button.
//
// Rendered via `component="div"` (rather than `ActionIcon`'s default `<button>`) because this
// is placed inside a Mantine `Tabs.Tab`'s `rightSection`, and `Tabs.Tab` itself renders a
// `<button>` — nesting an interactive `<button>` inside another `<button>` is invalid HTML and
// triggers a React hydration mismatch (the browser silently hoists/reparents the inner button
// out of its parent, breaking the click handler wiring). `role="button"`/`tabIndex`/`onKeyDown`
// restore the same keyboard affordance a real button would have.
export function ViewTabActionsMenu({ viewName, onDuplicate, duplicating }: ViewTabActionsMenuProperties) {
  return (
    <Menu shadow="md" width={180} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          component="div"
          role="button"
          tabIndex={0}
          variant="subtle"
          size="xs"
          aria-label={`"${viewName}" view actions`}
          loading={duplicating ?? false}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
        >
          <IconDots size={12} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconCopy size={14} />}
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate();
          }}
        >
          Duplicate view
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
