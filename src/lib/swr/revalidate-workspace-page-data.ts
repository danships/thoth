import { mutate } from 'swr';
import {
  GET_DELETED_PAGES_ENDPOINT,
  GET_PAGE_DETAILS_ENDPOINT,
  GET_PAGES_ENDPOINT,
  GET_PAGES_TREE_ENDPOINT,
} from '@/types/api';

export async function revalidateWorkspacePageData(workspaceId: string, pageId?: string): Promise<void> {
  await Promise.all([
    mutate(
      (key) =>
        typeof key === 'string' &&
        key.startsWith(`${GET_PAGES_TREE_ENDPOINT}?`) &&
        key.includes(`workspaceId=${workspaceId}`)
    ),
    mutate(`${GET_PAGES_ENDPOINT}?recent=true&workspaceId=${workspaceId}`),
    mutate(`${GET_PAGES_ENDPOINT}?favorited=true&workspaceId=${workspaceId}`),
    mutate(`${GET_DELETED_PAGES_ENDPOINT}?workspaceId=${workspaceId}`),
    pageId
      ? mutate(
          `${GET_PAGE_DETAILS_ENDPOINT.replace(':id', pageId)}?includeContent=true&includeValues=true&includeColumns=true`
        )
      : Promise.resolve(undefined),
  ]);
}
