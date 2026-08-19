'use client';

import { Button, Combobox, Group, Loader, Modal, Text, TextInput, useCombobox } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import type { Page } from '@/types/api';

type PageParentActionModalProperties = {
  action: 'copy' | 'move';
  source: Page;
  opened: boolean;
  onClose: () => void;
  onCompleted: (page: Page) => void;
};
type Choice = { id: string | null; name: string; path?: string[]; isPrivate?: boolean };

export function PageParentActionModal({
  action,
  source,
  opened,
  onClose,
  onCompleted,
}: PageParentActionModalProperties) {
  const combobox = useCombobox();
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selected, setSelected] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [wasOpened, setWasOpened] = useState(opened);
  if (opened !== wasOpened) {
    setWasOpened(opened);
    if (opened) {
      setQuery('');
      setSelected(null);
      setError('');
    }
  }
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => {
      setLoading(true);
      api.pages
        .getParentOptions(source.id, { action, query, limit: 20 })
        .then(({ data }) => {
          setChoices([
            ...(data.data.rootAllowed ? [{ id: null, name: 'Workspace root' }] : []),
            ...data.data.options.map((option) => ({
              id: option.id,
              name: option.name,
              path: option.ancestorNames,
              isPrivate: option.isPrivate,
            })),
          ]);
        })
        .catch(() => setError('Could not load destinations. Please try again.'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [action, opened, query, source.id]);
  const label = action === 'copy' ? 'Copy page' : 'Move page';
  const selectedLabel = selected ? selected.name : '';
  const options = useMemo(
    () =>
      choices.map((choice) => (
        <Combobox.Option value={choice.id ?? '__root__'} key={choice.id ?? '__root__'}>
          <Group gap="xs">
            <Text>{choice.name}</Text>
            {choice.isPrivate && <IconLock size={13} />}
          </Group>
          {choice.path?.length ? (
            <Text size="xs" c="dimmed">
              {choice.path.join(' / ')}
            </Text>
          ) : null}
        </Combobox.Option>
      )),
    [choices]
  );
  const submit = async () => {
    if (!selected || pending) {
      setError('Choose a new parent.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const response =
        action === 'copy'
          ? await api.pages.copy(source.id, { parentId: selected.id })
          : await api.pages.move(source.id, { parentId: selected.id, expectedParentId: source.parentId });
      onCompleted(response.data.data.page);
      onClose();
    } catch (error_: unknown) {
      const status = (error_ as { response?: { status?: number } }).response?.status;
      setError(
        status === 409
          ? 'This page was moved elsewhere. Close and try again.'
          : 'Unable to complete this action. Please try again.'
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={label}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <Text size="sm" mb="sm">
        {action === 'copy'
          ? 'Creates a copy under the selected parent. The copy follows its destination privacy.'
          : 'Moving carries this page and its sub-pages.'}
      </Text>
      <Combobox
        store={combobox}
        onOptionSubmit={(value) => {
          const choice = choices.find((item) => (item.id ?? '__root__') === value) ?? null;
          setSelected(choice);
          setQuery(choice?.name ?? '');
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <TextInput
            label="New parent"
            value={selected ? selectedLabel : query}
            onChange={(event) => {
              setSelected(null);
              setQuery(event.currentTarget.value);
              combobox.openDropdown();
            }}
            onFocus={() => combobox.openDropdown()}
            disabled={pending}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>
            {loading && (
              <Combobox.Empty>
                <Loader size="xs" />
              </Combobox.Empty>
            )}
            {!loading && options.length > 0 && options}
            {!loading && options.length === 0 && <Combobox.Empty>No matching pages</Combobox.Empty>}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      {error && (
        <Text c="red" size="sm" mt="sm">
          {error}
        </Text>
      )}
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} loading={pending}>
          {action === 'copy' ? 'Copy' : 'Move'}
        </Button>
      </Group>
    </Modal>
  );
}
