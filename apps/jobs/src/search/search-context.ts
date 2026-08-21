import type { WorkspaceSearchService } from './workspace-search-service.js';

let currentSearchService: WorkspaceSearchService | undefined;

export function setSearchService(searchService: WorkspaceSearchService): void {
  currentSearchService = searchService;
}

export function getSearchService(): WorkspaceSearchService {
  if (!currentSearchService) {
    throw new Error('WorkspaceSearchService accessed before it was set — call setSearchService() first');
  }
  return currentSearchService;
}

export function resetSearchServiceForTests(): void {
  currentSearchService = undefined;
}
