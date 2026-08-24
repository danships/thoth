'use client';

import axios from 'axios';
import { Button, Combobox, Group, Loader, Modal, Text, TextInput, useCombobox } from '@mantine/core';
import { IconLock, IconTable } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { usePagesByRecent } from '@/lib/hooks/api/use-pages';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import type { DataViewSearchResult, Page, PageSearchResult } from '@/types/api';

type PageParentActionModalProperties = {
  action: 'copy' | 'move';
  source: Page;
  opened: boolean;
  onClose: () => void;
  onCompleted: (page: Page) => void;
};

type Choice = {
  optionId: string;
  destinationParentId: string | null;
  kind: 'root' | 'page' | 'data-view';
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
    optionId: `page:${page.id}`,
    destinationParentId: page.id,
    kind: 'page',
    name: page.name,
    isPrivate: page.isPrivate,
    ...(ancestors?.length
      ? { path: ancestors.map((ancestor) => ancestor.name), ancestorIds: ancestors.map((ancestor) => ancestor.id) }
      : {}),
  };
}

function mapDataViewChoice(result: DataViewSearchResult): Choice {
  return {
    optionId: `data-view:${result.dataView.id}`,
    destinationParentId: result.dataView.dataSourceId,
    kind: 'data-view',
    name: result.dataView.name,
    path: [`Data source: ${result.dataView.dataSourceName}`],
  };
}

function isAbortError(error: unknown): boolean {
  return axios.isCancel(error) || (error instanceof Error && ['AbortError', 'CanceledError'].includes(error.name));
}

function getSubmitErrorMessage(status: number | undefined, action: 'copy' | 'move'): string {
  if (status === 409) return 'This page was moved elsewhere. Close and try again.';
  if (status === 400 && action === 'move') return 'A page cannot be moved into itself or one of its sub-pages.';
  if (status === 403 || status === 404) return 'That destination is no longer available.';
  return 'Unable to complete this action. Please try again.';
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
  const [pageSearchChoices, setPageSearchChoices] = useState<Choice[]>([]);
  const [dataViewSearchChoices, setDataViewSearchChoices] = useState<Choice[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [partialSearchError, setPartialSearchError] = useState(false);
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
      setPageSearchChoices([]);
      setDataViewSearchChoices([]);
      setSearchError(false);
      setPartialSearchError(false);
      setError('');
      combobox.openDropdown();
    }
    previousOpened.current = opened;
  }, [combobox, opened]);

  useEffect(() => {
    requestId.current += 1;
    if (!opened || recentMode) {
      return;
    }

    const currentRequestId = requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(false);
      setPartialSearchError(false);
      void Promise.allSettled([
        api.search.pages({ query: trimmedInput, workspaceId, limit: 10 }, { signal: controller.signal }),
        api.search.dataViews({ query: trimmedInput, workspaceId, limit: 10 }, { signal: controller.signal }),
      ])
        .then((outcomes) => {
          if (requestId.current !== currentRequestId) return;
          const [pages, dataViews] = outcomes;
          const pageFailure = pages.status === 'rejected' && !isAbortError(pages.reason);
          const viewFailure = dataViews.status === 'rejected' && !isAbortError(dataViews.reason);
          if (pages.status === 'fulfilled')
            setPageSearchChoices(
              pages.value.data.data.results.map((result: PageSearchResult) => mapChoice(result.page, result.ancestors))
            );
          if (dataViews.status === 'fulfilled')
            setDataViewSearchChoices(dataViews.value.data.data.results.map(mapDataViewChoice));
          setSearchError(pageFailure && viewFailure);
          setPartialSearchError((pageFailure || viewFailure) && !(pageFailure && viewFailure));
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
        .filter((choice) => choice.destinationParentId !== source.id)
        .filter((choice) => action !== 'move' || choice.destinationParentId !== source.parentId),
    [action, recentPages, source.id, source.parentId]
  );

  const pageChoices = useMemo(() => {
    const choices = recentMode ? recentChoices : pageSearchChoices;
    const seen = new Set<string>();
    return choices
      .filter((choice) => {
        if (choice.destinationParentId === source.id || (action === 'move' && choice.ancestorIds?.includes(source.id)))
          return false;
        if (seen.has(choice.optionId)) return false;
        seen.add(choice.optionId);
        return true;
      })
      .slice(0, recentMode ? 10 : 20);
  }, [action, recentChoices, recentMode, pageSearchChoices, source.id]);

  const dataViewChoices = useMemo(
    () =>
      recentMode
        ? []
        : dataViewSearchChoices.filter((choice) => action !== 'move' || choice.destinationParentId !== source.parentId),
    [action, dataViewSearchChoices, recentMode, source.parentId]
  );

  const choices = useMemo(
    () => [
      ...(scopeType === 'workspace'
        ? [{ optionId: 'root', destinationParentId: null, kind: 'root' as const, name: 'Workspace root' }]
        : []),
      ...pageChoices,
      ...dataViewChoices,
    ],
    [dataViewChoices, pageChoices, scopeType]
  );
  const loading = recentMode ? recentLoading : opened && searchLoading;
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
          ? await api.pages.copy(source.id, { parentId: selectedChoice.destinationParentId })
          : await api.pages.move(source.id, {
              parentId: selectedChoice.destinationParentId,
              expectedParentId: source.parentId,
            });
      onCompleted(response.data.data.page);
      onClose();
    } catch (error_: unknown) {
      const status = (error_ as { response?: { status?: number } }).response?.status;
      setError(getSubmitErrorMessage(status, action));
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
        withinPortal={false}
        onOptionSubmit={(value) => {
          const choice = choices.find((item) => item.optionId === value) ?? null;
          setSelectedChoice(choice);
          setInputValue(choice?.name ?? '');
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <TextInput
            label="Destination"
            autoFocus
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
            {!loading && !loadFailed && partialSearchError && (
              <Combobox.Empty>
                <Text size="sm">Some destinations could not be loaded.</Text>
                <Button size="xs" variant="subtle" onClick={() => setSearchRetry((value) => value + 1)}>
                  Retry
                </Button>
              </Combobox.Empty>
            )}
            {!loading &&
              !loadFailed &&
              choices
                .filter((choice) => choice.kind === 'root')
                .map((choice) => (
                  <Combobox.Option value={choice.optionId} key={choice.optionId}>
                    <Text>{choice.name}</Text>
                  </Combobox.Option>
                ))}
            {!loading && !loadFailed && !recentMode && pageChoices.length > 0 && (
              <Combobox.Group label="Pages">
                {pageChoices.map((choice) => (
                  <Combobox.Option value={choice.optionId} key={choice.optionId}>
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
              </Combobox.Group>
            )}
            {!loading &&
              !loadFailed &&
              recentMode &&
              pageChoices.map((choice) => (
                <Combobox.Option value={choice.optionId} key={choice.optionId}>
                  <Group gap="xs">
                    <Text>{choice.name}</Text>
                    {choice.isPrivate && <IconLock size={13} />}
                  </Group>
                </Combobox.Option>
              ))}
            {!loading && !loadFailed && !recentMode && dataViewChoices.length > 0 && (
              <Combobox.Group label="Data views">
                {dataViewChoices.map((choice) => (
                  <Combobox.Option value={choice.optionId} key={choice.optionId}>
                    <Group gap="xs">
                      <IconTable size={14} />
                      <Text>{choice.name}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {choice.path?.[0]}
                    </Text>
                  </Combobox.Option>
                ))}
              </Combobox.Group>
            )}
            {!loading && !loadFailed && pageChoices.length + dataViewChoices.length === 0 && (
              <Combobox.Empty>{recentMode ? 'No recent pages' : 'No matching pages or data views'}</Combobox.Empty>
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
