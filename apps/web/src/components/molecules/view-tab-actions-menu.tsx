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
// Rendered by the caller as a sibling of the `Tabs.Tab` button (not inside its `rightSection`),
// since `Tabs.Tab` itself renders a `<button>` and nesting another interactive `<button>`
// inside it is invalid HTML that assistive technology can misannounce or omit entirely. A
// plain `ActionIcon` (real `<button>`) is used here so it stays independently focusable and
// keyboard-operable without any ARIA workarounds.
export function ViewTabActionsMenu({ viewName, onDuplicate, duplicating }: ViewTabActionsMenuProperties) {
  return (
    <Menu shadow="md" width={180} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="xs"
          aria-label={`"${viewName}" view actions`}
          loading={duplicating ?? false}
          onClick={(event) => event.stopPropagation()}
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
