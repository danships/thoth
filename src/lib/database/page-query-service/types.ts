import type { Column } from '@/types/schemas/entities/container';
import type { FilterRule, SortRule } from '@/types/schemas/entities/data-view-query';
import type { PageContainer } from '@/types/database';

/** The two storage engines `executePageQuery` knows how to target. Each has its own adapter
 * implementation (see `sqlite-adapter.ts`/`mysql-adapter.ts`) behind the shared
 * `PageQueryEngineAdapter` interface (`adapter.ts`), so engine-specific SQL never leaks into the
 * orchestration logic in `index.ts`. */
export type Engine = 'sqlite' | 'mysql';

export type PageQueryCursor = {
  values: (string | number | boolean | null)[];
  containerId: string;
};

export type ExecutePageQueryOptions = {
  parentId: string;
  columns: Column[];
  filters: FilterRule[];
  sorts: SortRule[];
  cursor?: PageQueryCursor;
  limit: number;
};

export type ExecutePageQueryResult = {
  pages: PageContainer[];
  nextCursor: PageQueryCursor | null;
  hasMore: boolean;
};

/** A bindable SQL fragment: `sql` may contain `?` placeholders, positionally matched by `params`. */
export type SqlFragment = { sql: string; params: unknown[] };

export type Row = { id: string; contents: string | Record<string, unknown> };
