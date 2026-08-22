'use client';

import axios from 'axios';
import { Button, Combobox, Group, Loader, Modal, Text, TextInput, useCombobox } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { usePagesByRecent } from '@/lib/hooks/api/use-pages';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import type { GetSearchResultsResponse, Page } from '@/types/api';

type PageParentActionModalProperties = {
  action: 'copy' | 'move';
  source: Page;
  opened: boolean;
  onClose: () => void;
  onCompleted: (page: Page) => void;
};

type Choice = {
  id: string | null;
  name: string;
  path?: string[];
  ancestorIds?: string[];
  isPrivate?: boolean;
};

function mapChoice(
  page: { id: string; name: string; isPrivate: boolean },
  ancestors?: Array<{ id: string; name: string }>
): Choice {
  return {
    id: page.id,
    name: page.name,
    isPrivate: page.isPrivate,
    ...(ancestors?.length
      ? { path: ancestors.map((ancestor) => ancestor.name), ancestorIds: ancestors.map((ancestor) => ancestor.id) }
      : {}),
  };
}

function isAbortError(error: unknown): boolean {
  return axios.isCancel(error) || (error instanceof Error && ['AbortError', 'CanceledError'].includes(error.name));
}

export function PageParentActionModal({
  action,
  source,
  opened,
  onClose,
  onCompleted,
}: PageParentActionModalProperties) {
  const combobox = useCombobox();
  const { id: workspaceId, scopeType } = useCurrentWorkspace();
  const { data: recentPages, error: recentError, isLoading: recentLoading, mutate: mutateRecent } = usePagesByRecent();
  const [inputValue, setInputValue] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);
  const [searchChoices, setSearchChoices] = useState<Choice[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const previousOpened = useRef(opened);
  const requestId = useRef(0);
  const trimmedInput = inputValue.trim();
  const recentMode = trimmedInput.length === 0;

  useEffect(() => {
    if (!previousOpened.current && opened) {
      setInputValue('');
      setSelectedChoice(null);
      setSearchChoices([]);
      setSearchError(false);
      setError('');
      combobox.openDropdown();
    }
    previousOpened.current = opened;
  }, [combobox, opened]);

  useEffect(() => {
    if (!opened || recentMode) {
      requestId.current += 1;
      setSearchLoading(false);
      return;
    }

    const currentRequestId = ++requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(false);
      void api.search
        .pages({ query: trimmedInput, workspaceId, type: 'page', limit: 20 }, { signal: controller.signal })
        .then((response) => {
          if (requestId.current !== currentRequestId) return;
          const results = response.data.data.results as GetSearchResultsResponse['results'];
          setSearchChoices(
            results.filter((result) => result.page).map((result) => mapChoice(result.page, result.ancestors))
          );
        })
        .catch((nextError: unknown) => {
          if (requestId.current !== currentRequestId || isAbortError(nextError)) return;
          setSearchError(true);
          setSearchChoices([]);
        })
        .finally(() => {
          if (requestId.current === currentRequestId) setSearchLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [action, opened, recentMode, searchRetry, source.id, trimmedInput, workspaceId]);

  const recentChoices = useMemo(
    () =>
      (recentPages ?? [])
        .map(({ page }) => mapChoice(page))
        .filter((choice) => choice.id !== source.id)
        .filter((choice) => action !== 'move' || choice.id !== source.parentId),
    [action, recentPages, source.id, source.parentId]
  );

  const pageChoices = useMemo(() => {
    const choices = recentMode ? recentChoices : searchChoices;
    const seen = new Set<string>();
    return choices
      .filter((choice) => {
        if (choice.id === source.id || (action === 'move' && choice.ancestorIds?.includes(source.id))) return false;
        if (choice.id === null || seen.has(choice.id)) return false;
        seen.add(choice.id);
        return true;
      })
      .slice(0, recentMode ? 10 : 20);
  }, [action, recentChoices, recentMode, searchChoices, source.id]);

  const choices = useMemo(
    () => [...(scopeType === 'workspace' ? [{ id: null, name: 'Workspace root' }] : []), ...pageChoices],
    [pageChoices, scopeType]
  );
  const loading = recentMode ? recentLoading : searchLoading;
  const loadFailed = recentMode ? recentError !== undefined : searchError;
  const label = action === 'copy' ? 'Copy page' : 'Move page';

  const submit = async () => {
    if (!selectedChoice || pending) {
      setError('Choose a new parent.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const response =
        action === 'copy'
          ? await api.pages.copy(source.id, { parentId: selectedChoice.id })
          : await api.pages.move(source.id, { parentId: selectedChoice.id, expectedParentId: source.parentId });
      onCompleted(response.data.data.page);
      onClose();
    } catch (error_: unknown) {
      const status = (error_ as { response?: { status?: number } }).response?.status;
      setError(
        status === 409
          ? 'This page was moved elsewhere. Close and try again.'
          : status === 400 && action === 'move'
            ? 'A page cannot be moved into itself or one of its sub-pages.'
            : status === 403 || status === 404
              ? 'That destination is no longer available.'
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
          setSelectedChoice(choice);
          setInputValue(choice?.name ?? '');
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <TextInput
            label="New parent"
            value={inputValue}
            onChange={(event) => {
              setSelectedChoice(null);
              setInputValue(event.currentTarget.value);
              setError('');
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
            {!loading && loadFailed && (
              <Combobox.Empty>
                <Text size="sm">Could not load destinations. Please try again.</Text>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => (recentMode ? void mutateRecent() : setSearchRetry((value) => value + 1))}
                >
                  Retry
                </Button>
              </Combobox.Empty>
            )}
            {!loading &&
              !loadFailed &&
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
              ))}
            {!loading && !loadFailed && pageChoices.length === 0 && (
              <Combobox.Empty>{recentMode ? 'No recent pages' : 'No matching pages'}</Combobox.Empty>
            )}
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
