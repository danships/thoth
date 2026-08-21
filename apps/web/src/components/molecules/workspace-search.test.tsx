// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AxiosResponse } from 'axios';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { WorkspaceSearch } from './workspace-search';
import { api } from '@/lib/api/client';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    search: {
      get: vi.fn(),
    },
  },
}));

function renderComponent() {
  return render(
    createElement(
      MantineProvider,
      null,
      createElement(WorkspaceSearch, { workspaceId: 'workspace-1', workspaceSlug: 'demo-workspace' })
    )
  );
}

function makeSearchResponse(
  results: Array<{
    page: { id: string; name: string; emoji: string | null; parentId: string | null };
    score: number;
    snippet: string;
  }>
): AxiosResponse<{
  data: {
    results: Array<{
      page: { id: string; name: string; emoji: string | null; parentId: string | null };
      score: number;
      snippet: string;
    }>;
  };
}> {
  return {
    data: { data: { results } },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} as never },
  };
}

async function waitForDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 350));
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  class ResizeObserverMock {
    public disconnect = vi.fn();
    public observe = vi.fn();
    public unobserve = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('WorkspaceSearch', () => {
  test('renders accessible controls, opens the modal, and shows the initial state', async () => {
    const user = userEvent.setup();
    renderComponent();

    const button = screen.getByRole('button', { name: 'Search pages' });
    await user.click(button);

    expect(await screen.findByRole('textbox', { name: 'Search pages' })).toBeTruthy();
    expect(await screen.findByText('Type to search pages')).toBeTruthy();
  });

  test('debounces requests, aborts stale ones, clears old results immediately, and navigates on selection', async () => {
    const user = userEvent.setup();
    const mockedSearchGet = vi.mocked(api.search.get);
    const pending: Array<{
      signal?: AbortSignal;
      resolve: (value: Awaited<ReturnType<typeof api.search.get>>) => void;
    }> = [];

    mockedSearchGet.mockImplementation((_parameters, options) => {
      return new Promise((resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
        pending.push({
          ...(options?.signal ? { signal: options.signal } : {}),
          resolve,
        });
      }) as ReturnType<typeof api.search.get>;
    });

    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Search pages' }));

    const input = await screen.findByRole('textbox', { name: 'Search pages' });
    await user.type(input, 'root');
    await waitForDebounce();

    expect(mockedSearchGet).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Searching')).toBeTruthy();

    pending[0]!.resolve(
      makeSearchResponse([
        {
          page: { id: 'root-page-id', name: 'Root Page', emoji: '📄', parentId: null },
          score: 0.99,
          snippet: 'Root snippet',
        },
      ]) as Awaited<ReturnType<typeof api.search.get>>
    );

    expect(await screen.findByText('Root Page')).toBeTruthy();

    await user.type(input, ' updated');
    expect(screen.queryByText('Root Page')).toBeNull();

    await waitForDebounce();
    expect(pending[0]!.signal?.aborted).toBe(true);
    expect(mockedSearchGet).toHaveBeenCalledTimes(2);

    pending[1]!.resolve(
      makeSearchResponse([
        {
          page: { id: 'final-page-id', name: 'Final Page', emoji: null, parentId: null },
          score: 0.91,
          snippet: 'Final snippet',
        },
      ]) as Awaited<ReturnType<typeof api.search.get>>
    );

    const resultButton = await screen.findByRole('button', { name: /Final Page/i });
    await user.click(resultButton);

    expect(push).toHaveBeenCalledWith('/demo-workspace/pages/final-page-id');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Search this workspace' })).toBeNull();
    });
  });

  test('shows empty and error states', async () => {
    const user = userEvent.setup();
    const mockedSearchGet = vi.mocked(api.search.get);

    mockedSearchGet.mockResolvedValueOnce(makeSearchResponse([]) as Awaited<ReturnType<typeof api.search.get>>);
    mockedSearchGet.mockRejectedValueOnce(new Error('socket unavailable'));

    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Search pages' }));

    const input = await screen.findByRole('textbox', { name: 'Search pages' });

    await user.type(input, 'missing');
    await waitForDebounce();
    expect(await screen.findByText('No pages found')).toBeTruthy();

    await user.clear(input);
    await user.type(input, 'error');
    await waitForDebounce();
    expect(await screen.findByText('Search is temporarily unavailable')).toBeTruthy();
  });
});
