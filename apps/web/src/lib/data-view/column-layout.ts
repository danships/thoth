import { BadRequestError } from '@/lib/errors/bad-request-error';
import type { Column } from '@/types/schemas/entities/container';
import type { ViewColumnLayoutItem } from '@/types/schemas/entities/data-view';

// A resolved, render-ready entry in a Data View table's column layout (THOTH-052). Unlike the
// persisted `ViewColumnLayoutItem`, a `kind: 'data'` entry here carries the full, currently-live
// `Column` (name, type, options, etc.) rather than just its id — resolved fresh against the
// Data Source on every render, so a column rename/type change is reflected immediately without
// needing its own layout write.
export type ResolvedColumnLayoutItem =
  { kind: 'name'; visible: boolean } | { kind: 'data'; visible: boolean; column: Column };

export type ResolvedColumnLayout = {
  // Every configured (or defaulted) entry, in order, including hidden ones — used by the column
  // manager modal, which must let a user find and re-show a hidden column.
  all: ResolvedColumnLayoutItem[];
  // Only the visible subset, in order — used to render the Data View table itself.
  visible: ResolvedColumnLayoutItem[];
};

/**
 * Resolves a Data View's persisted `columnLayout` (plus its legacy `columns` array, kept for
 * backward compatibility and the separate page-Fields ordering path) against the Data Source's
 * *current* columns into a render-ready, ordered list.
 *
 * - `columnLayout: null` (every view created before THOTH-052, and never yet re-ordered) falls
 *   back to: Name first and visible, followed by the legacy `columns` order (or Data Source
 *   order when `columns` is empty), with every Data Source column visible.
 * - An explicit `columnLayout` is read largely as-is, except: stale entries referencing a
 *   deleted column are dropped, a missing/duplicate Name entry is defensively normalised to
 *   exactly one (visible, first), and any Data Source column not yet represented (e.g. added
 *   after the layout was last saved) is appended, visible, at the end.
 *
 * Pure — never mutates `dataSourceColumns`, `legacyColumns`, or `columnLayout`.
 */
export function resolveDataViewColumnLayout(
  dataSourceColumns: Column[],
  legacyColumns: string[],
  columnLayout: ViewColumnLayoutItem[] | null
): ResolvedColumnLayout {
  const columnsById = new Map(dataSourceColumns.map((column) => [column.id, column] as const));
  const all: ResolvedColumnLayoutItem[] = [];
  const seenDataIds = new Set<string>();
  let sawName = false;

  if (columnLayout && columnLayout.length > 0) {
    for (const item of columnLayout) {
      if (item.kind === 'name') {
        if (sawName) {
          // Corrupt/duplicate persisted data — keep only the first Name entry.
          continue;
        }
        sawName = true;
        all.push({ kind: 'name', visible: item.visible });
      } else {
        const column = columnsById.get(item.columnId);
        if (!column || seenDataIds.has(item.columnId)) {
          // Deleted/stale column id, or a defensive duplicate — drop it.
          continue;
        }
        seenDataIds.add(item.columnId);
        all.push({ kind: 'data', visible: item.visible, column });
      }
    }
    if (!sawName) {
      // Defensive: every canonical layout is written with exactly one Name entry, but a
      // corrupted/legacy-shaped record could be missing one — treat it as visible and first.
      all.unshift({ kind: 'name', visible: true });
    }
  } else {
    all.push({ kind: 'name', visible: true });
    const orderedIds = legacyColumns.length > 0 ? legacyColumns : dataSourceColumns.map((column) => column.id);
    for (const id of orderedIds) {
      const column = columnsById.get(id);
      if (!column || seenDataIds.has(id)) {
        continue;
      }
      seenDataIds.add(id);
      all.push({ kind: 'data', visible: true, column });
    }
  }

  // Append any Data Source column not yet represented (newly added since the layout was last
  // saved, or since the legacy `columns` array was last touched) — visibly, at the end.
  for (const column of dataSourceColumns) {
    if (!seenDataIds.has(column.id)) {
      seenDataIds.add(column.id);
      all.push({ kind: 'data', visible: true, column });
    }
  }

  return { all, visible: all.filter((item) => item.visible) };
}

/**
 * Validates and canonicalises a client-supplied `columnLayout` for `PATCH /views/:id` against
 * the (possibly just-changed) Data Source's *current* columns. Throws `BadRequestError` for:
 * more than one `kind: 'name'` entry, zero `kind: 'name'` entries, a duplicate `columnId`, or a
 * `columnId` that doesn't exist on `dataSourceColumns` (unknown, deleted, or foreign to another
 * Data Source). Any Data Source column added concurrently since the client loaded its layout is
 * appended, visibly, at the end — never rejected.
 *
 * Pure — never mutates `dataSourceColumns` or `requestedLayout`.
 */
export function validateColumnLayoutForWrite(
  dataSourceColumns: Column[],
  requestedLayout: ViewColumnLayoutItem[]
): ViewColumnLayoutItem[] {
  const columnsById = new Map(dataSourceColumns.map((column) => [column.id, column] as const));
  const canonical: ViewColumnLayoutItem[] = [];
  const seenDataIds = new Set<string>();
  let nameCount = 0;

  for (const item of requestedLayout) {
    if (item.kind === 'name') {
      nameCount += 1;
      if (nameCount > 1) {
        throw new BadRequestError('Column layout may only contain one Name entry');
      }
      canonical.push({ kind: 'name', visible: item.visible });
    } else {
      if (!columnsById.has(item.columnId)) {
        throw new BadRequestError(`Unknown or deleted column in layout: ${item.columnId}`);
      }
      if (seenDataIds.has(item.columnId)) {
        throw new BadRequestError(`Duplicate column in layout: ${item.columnId}`);
      }
      seenDataIds.add(item.columnId);
      canonical.push({ kind: 'data', columnId: item.columnId, visible: item.visible });
    }
  }

  if (nameCount === 0) {
    throw new BadRequestError('Column layout must include exactly one Name entry');
  }

  for (const column of dataSourceColumns) {
    if (!seenDataIds.has(column.id)) {
      seenDataIds.add(column.id);
      canonical.push({ kind: 'data', columnId: column.id, visible: true });
    }
  }

  return canonical;
}

/**
 * Converts a resolved (render-ready) layout back into its persisted `ViewColumnLayoutItem[]`
 * shape — used after a header drag or a Column Manager Apply, immediately before calling
 * `PATCH /views/:id`.
 */
export function toViewColumnLayoutItems(items: ResolvedColumnLayoutItem[]): ViewColumnLayoutItem[] {
  return items.map((item) =>
    item.kind === 'name'
      ? { kind: 'name', visible: item.visible }
      : { kind: 'data', columnId: item.column.id, visible: item.visible }
  );
}
