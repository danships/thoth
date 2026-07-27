'use client';

import { Modal } from '@mantine/core';
import { WorkspaceCreateForm } from '@/components/organisms/workspace-create-form';
import type { WorkspaceApi } from '@/types/api';

type CreateWorkspaceModalProperties = {
  opened: boolean;
  onClose: () => void;
  onCreated: (workspace: WorkspaceApi) => void;
};

// Quick-create overlay reachable from the sidebar workspace switcher. Wraps the shared
// `WorkspaceCreateForm` (name + editable, live-validated slug); the same form backs the
// dedicated `/workspaces/new` full-page flow.
export function CreateWorkspaceModal({ opened, onClose, onCreated }: CreateWorkspaceModalProperties) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create workspace"
      centered
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <WorkspaceCreateForm autoFocus onCreated={onCreated} />
    </Modal>
  );
}
