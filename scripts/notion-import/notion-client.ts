// Thin wrapper around `@notionhq/client` for the parts the import script needs: token
// validation, enumerating roots, and BFS-walking pages/databases and their block children.
//
// Note on the 2025+ Notion API: a "database" container can hold multiple "data sources"
// (multi-source databases); properties and rows live on the data source, not the database
// container. `search` now returns data sources directly (not their parent database container),
// and each data source carries its own `properties` and a `database_parent` pointing at its
// containing database's parent — which is exactly the shape this script needs, so
// `NotionDatabaseLike` below models a single data source. Only when an operator explicitly
// passes a legacy multi-source *database* id via `NOTION_ROOT_IDS` do we need to resolve which
// (if any) single data source it maps to; multi-source databases are skipped there (see
// feature-gap analysis — linked/multi-source databases are not migrated).

import { Client, isFullPage, isFullDataSource, isFullBlock } from '@notionhq/client';
import type { NotionPageLike, NotionDatabaseLike, NotionBlockLike } from './index';

export class NotionClient {
  private readonly client: Client;

  constructor(token: string, client?: Client) {
    this.client = client ?? new Client({ auth: token });
  }

  // Validates the token and returns a stable identifier for the connected Notion
  // workspace/integration, used for drift detection against the state file's stored
  // `connection.notionWorkspaceId`.
  async validateTokenAndGetWorkspaceId(): Promise<string | null> {
    const me = await this.client.users.me({});
    return me?.id ?? null;
  }

  // Enumerates root objects: either the explicit `NOTION_ROOT_IDS` (retrieved individually) or,
  // when unset, everything the integration/token can `search` for whose parent is the workspace
  // itself (top-level pages/data sources shared with the integration).
  async fetchRoots(explicitRootIds: string[] | null): Promise<(NotionPageLike | NotionDatabaseLike)[]> {
    if (explicitRootIds && explicitRootIds.length > 0) {
      const roots: (NotionPageLike | NotionDatabaseLike)[] = [];
      for (const id of explicitRootIds) {
        const object = await this.retrieve(id);
        if (object) {
          roots.push(object);
        }
      }
      return roots;
    }

    const roots: (NotionPageLike | NotionDatabaseLike)[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.client.search(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 });
      for (const result of response.results) {
        if (isFullPage(result) && result.parent.type === 'workspace') {
          roots.push(toPageLike(result));
        } else if (isFullDataSource(result) && result.database_parent.type === 'workspace') {
          roots.push(toDatabaseLike(result));
        }
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return roots;
  }

  async retrieve(id: string): Promise<NotionPageLike | NotionDatabaseLike | null> {
    try {
      const page = await this.client.pages.retrieve({ page_id: id });
      if (isFullPage(page)) {
        return toPageLike(page);
      }
    } catch {
      // fall through — might be a data source or (legacy) database id instead
    }
    try {
      const dataSource = await this.client.dataSources.retrieve({ data_source_id: id });
      if (isFullDataSource(dataSource)) {
        return toDatabaseLike(dataSource);
      }
    } catch {
      // fall through — might be a legacy multi-source database id
    }
    try {
      const database = await this.client.databases.retrieve({ database_id: id });
      const dataSourceReferences = 'data_sources' in database ? database.data_sources : [];
      const firstReference = dataSourceReferences[0];
      if (dataSourceReferences.length === 1 && firstReference) {
        return this.retrieve(firstReference.id);
      }
      if (dataSourceReferences.length > 1) {
        console.warn(
          `[notion-import] Database ${id} has ${dataSourceReferences.length} data sources — skipped (only single-data-source databases are migrated).`
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  async listBlockChildren(blockId: string): Promise<NotionBlockLike[]> {
    const blocks: NotionBlockLike[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.client.blocks.children.list(
        cursor ? { block_id: blockId, start_cursor: cursor, page_size: 100 } : { block_id: blockId, page_size: 100 }
      );
      for (const result of response.results) {
        if (isFullBlock(result)) {
          blocks.push(toBlockLike(result));
        }
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return blocks;
  }

  async queryDatabaseRows(dataSourceId: string): Promise<NotionPageLike[]> {
    const rows: NotionPageLike[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.client.dataSources.query(
        cursor
          ? { data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 }
          : { data_source_id: dataSourceId, page_size: 100 }
      );
      for (const result of response.results) {
        if (isFullPage(result)) {
          rows.push(toPageLike(result));
        }
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return rows;
  }
}

function toPageLike(page: {
  id: string;
  archived?: boolean;
  last_edited_time: string;
  icon?: { type: string; emoji?: string } | null;
  properties: Record<string, unknown>;
  parent: { type: string };
}): NotionPageLike {
  return {
    id: page.id,
    object: 'page',
    ...(page.archived === undefined ? {} : { archived: page.archived }),
    last_edited_time: page.last_edited_time,
    icon: page.icon ?? null,
    properties: page.properties as NotionPageLike['properties'],
    parent: page.parent,
  };
}

function toDatabaseLike(dataSource: {
  id: string;
  archived?: boolean;
  last_edited_time: string;
  title?: { plain_text: string }[];
  properties: Record<string, unknown>;
}): NotionDatabaseLike {
  return {
    id: dataSource.id,
    object: 'database',
    ...(dataSource.archived === undefined ? {} : { archived: dataSource.archived }),
    last_edited_time: dataSource.last_edited_time,
    ...(dataSource.title === undefined ? {} : { title: dataSource.title }),
    properties: dataSource.properties as NotionDatabaseLike['properties'],
    dataSourceId: dataSource.id,
  };
}

function toBlockLike(block: {
  id: string;
  type: string;
  archived?: boolean;
  has_children: boolean;
  [key: string]: unknown;
}): NotionBlockLike {
  return { ...block };
}
