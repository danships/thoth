import { describe, expect, it } from 'vitest';
import { resolveDataViewColumnLayout, validateColumnLayoutForWrite } from './column-layout';
import type { Column } from '@/types/schemas/entities/container';
import type { ViewColumnLayoutItem } from '@/types/schemas/entities/data-view';
import type { ResolvedColumnLayoutItem } from './column-layout';

const colA: Column = { id: 'col-a', name: 'Alpha', type: 'string' };
const colB: Column = { id: 'col-b', name: 'Beta', type: 'string' };
const colC: Column = { id: 'col-c', name: 'Gamma', type: 'string' };

// `createdAt`/`lastUpdated` (THOTH-078) are always present and, by default, appended hidden at
// the end of every resolved layout — every pre-existing assertion below that inspects the full
// `all` array must account for these two trailing entries.
const SYSTEM_APPENDED_RESOLVED: ResolvedColumnLayoutItem[] = [
  { kind: 'system', visible: false, columnId: 'createdAt' },
  { kind: 'system', visible: false, columnId: 'lastUpdated' },
];
const SYSTEM_APPENDED_LAYOUT: ViewColumnLayoutItem[] = [
  { kind: 'system', columnId: 'createdAt', visible: false },
  { kind: 'system', columnId: 'lastUpdated', visible: false },
];

function itemId(item: ResolvedColumnLayoutItem): string {
  if (item.kind === 'name') return 'name';
  if (item.kind === 'system') return item.columnId;
  return item.column.id;
}

describe('resolveDataViewColumnLayout', () => {
  it('resolves a null layout to Name first, then Data Source order, all visible', () => {
    const result = resolveDataViewColumnLayout([colA, colB, colC], [], null);

    expect(result.all).toEqual([
      { kind: 'name', visible: true },
      { kind: 'data', visible: true, column: colA },
      { kind: 'data', visible: true, column: colB },
      { kind: 'data', visible: true, column: colC },
      ...SYSTEM_APPENDED_RESOLVED,
    ]);
    // The appended system columns default to hidden, so `visible` excludes them.
    expect(result.visible).toEqual(result.all.slice(0, -2));
  });

  it('resolves a null layout using the legacy columns order when provided', () => {
    const result = resolveDataViewColumnLayout([colA, colB, colC], ['col-c', 'col-a'], null);

    expect(result.all.map((item) => itemId(item))).toEqual([
      'name',
      'col-c',
      'col-a',
      // col-b was never in `columns`, so it's appended at the end.
      'col-b',
      'createdAt',
      'lastUpdated',
    ]);
  });

  it('drops stale ids in the legacy columns array', () => {
    const result = resolveDataViewColumnLayout([colA], ['col-a', 'deleted-col'], null);
    expect(result.all.map((item) => itemId(item))).toEqual(['name', 'col-a', 'createdAt', 'lastUpdated']);
  });

  it('renders Name at its configured (moved) position', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'data', columnId: 'col-a', visible: true },
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-b', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA, colB], [], layout);
    expect(result.all.map((item) => itemId(item))).toEqual(['col-a', 'name', 'col-b', 'createdAt', 'lastUpdated']);
  });

  it('respects Name hidden', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: false },
      { kind: 'data', columnId: 'col-a', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA], [], layout);
    expect(result.all).toEqual([
      { kind: 'name', visible: false },
      { kind: 'data', visible: true, column: colA },
      ...SYSTEM_APPENDED_RESOLVED,
    ]);
    expect(result.visible).toEqual([{ kind: 'data', visible: true, column: colA }]);
  });

  it('hides every configurable column while keeping Name visible', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: false },
      { kind: 'data', columnId: 'col-b', visible: false },
    ];
    const result = resolveDataViewColumnLayout([colA, colB], [], layout);
    expect(result.visible).toEqual([{ kind: 'name', visible: true }]);
  });

  it('retains a hidden item at its stored position', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
      { kind: 'data', columnId: 'col-b', visible: false },
      { kind: 'data', columnId: 'col-c', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA, colB, colC], [], layout);
    expect(result.all.map((item) => itemId(item))).toEqual([
      'name',
      'col-a',
      'col-b',
      'col-c',
      'createdAt',
      'lastUpdated',
    ]);
    expect(result.visible.map((item) => itemId(item))).toEqual(['name', 'col-a', 'col-c']);
  });

  it('appends a newly added Data Source column visibly at the end', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA, colB], [], layout);
    expect(result.all.map((item) => itemId(item))).toEqual(['name', 'col-a', 'col-b', 'createdAt', 'lastUpdated']);
    expect(result.all.at(-3)).toEqual({ kind: 'data', visible: true, column: colB });
  });

  it('drops a stale/deleted column id from an explicit layout', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
      { kind: 'data', columnId: 'deleted-col', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA], [], layout);
    expect(result.all.map((item) => itemId(item))).toEqual(['name', 'col-a', 'createdAt', 'lastUpdated']);
  });

  it('defensively normalises a missing Name entry to one, first, visible', () => {
    const layout: ViewColumnLayoutItem[] = [{ kind: 'data', columnId: 'col-a', visible: true }];
    const result = resolveDataViewColumnLayout([colA], [], layout);
    expect(result.all[0]).toEqual({ kind: 'name', visible: true });
  });

  it('defensively drops a duplicate Name entry', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'name', visible: false },
      { kind: 'data', columnId: 'col-a', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA], [], layout);
    expect(result.all.filter((item) => item.kind === 'name')).toHaveLength(1);
    expect(result.all[0]).toEqual({ kind: 'name', visible: true });
  });

  it('does not mutate its inputs', () => {
    const dataSourceColumns = [colA, colB];
    const legacyColumns = ['col-b'];
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: false },
    ];
    const dataSourceColumnsCopy = [...dataSourceColumns];
    const legacyColumnsCopy = [...legacyColumns];
    const layoutCopy = layout.map((item) => ({ ...item }));

    resolveDataViewColumnLayout(dataSourceColumns, legacyColumns, layout);

    expect(dataSourceColumns).toEqual(dataSourceColumnsCopy);
    expect(legacyColumns).toEqual(legacyColumnsCopy);
    expect(layout).toEqual(layoutCopy);
  });

  describe('system columns (THOTH-078)', () => {
    it('appends createdAt/lastUpdated hidden at the end of a null layout', () => {
      const result = resolveDataViewColumnLayout([colA], [], null);
      expect(result.all.slice(-2)).toEqual(SYSTEM_APPENDED_RESOLVED);
      expect(result.visible.some((item) => item.kind === 'system')).toBe(false);
    });

    it('renders a system column at its configured (moved, visible) position', () => {
      const layout: ViewColumnLayoutItem[] = [
        { kind: 'name', visible: true },
        { kind: 'system', columnId: 'createdAt', visible: true },
        { kind: 'data', columnId: 'col-a', visible: true },
      ];
      const result = resolveDataViewColumnLayout([colA], [], layout);
      expect(result.all.map((item) => itemId(item))).toEqual(['name', 'createdAt', 'col-a', 'lastUpdated']);
      expect(result.visible.map((item) => itemId(item))).toEqual(['name', 'createdAt', 'col-a']);
    });

    it('de-duplicates a corrupted layout with the same system column twice, keeping the first', () => {
      const layout: ViewColumnLayoutItem[] = [
        { kind: 'name', visible: true },
        { kind: 'system', columnId: 'createdAt', visible: true },
        { kind: 'system', columnId: 'createdAt', visible: false },
      ];
      const result = resolveDataViewColumnLayout([], [], layout);
      expect(result.all.filter((item) => item.kind === 'system' && item.columnId === 'createdAt')).toEqual([
        { kind: 'system', visible: true, columnId: 'createdAt' },
      ]);
    });

    it('appends only the missing system column when one is already represented', () => {
      const layout: ViewColumnLayoutItem[] = [
        { kind: 'name', visible: true },
        { kind: 'system', columnId: 'lastUpdated', visible: true },
      ];
      const result = resolveDataViewColumnLayout([], [], layout);
      expect(result.all).toEqual([
        { kind: 'name', visible: true },
        { kind: 'system', visible: true, columnId: 'lastUpdated' },
        { kind: 'system', visible: false, columnId: 'createdAt' },
      ]);
    });
  });
});

describe('validateColumnLayoutForWrite', () => {
  it('accepts a valid layout and returns it canonicalised, appending hidden system columns', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: false },
    ];
    const result = validateColumnLayoutForWrite([colA], layout);
    expect(result).toEqual([...layout, ...SYSTEM_APPENDED_LAYOUT]);
  });

  it('appends a column added concurrently since the client loaded its layout', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
    ];
    const result = validateColumnLayoutForWrite([colA, colB], layout);
    expect(result).toEqual([...layout, { kind: 'data', columnId: 'col-b', visible: true }, ...SYSTEM_APPENDED_LAYOUT]);
  });

  it('rejects a layout missing a Name entry', () => {
    const layout: ViewColumnLayoutItem[] = [{ kind: 'data', columnId: 'col-a', visible: true }];
    expect(() => validateColumnLayoutForWrite([colA], layout)).toThrow(/Name/);
  });

  it('rejects a layout with more than one Name entry', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'name', visible: false },
    ];
    expect(() => validateColumnLayoutForWrite([], layout)).toThrow(/one Name/);
  });

  it('rejects a duplicate data column id', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
      { kind: 'data', columnId: 'col-a', visible: false },
    ];
    expect(() => validateColumnLayoutForWrite([colA], layout)).toThrow(/Duplicate/);
  });

  it('rejects an unknown/deleted/foreign column id', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'not-on-this-source', visible: true },
    ];
    expect(() => validateColumnLayoutForWrite([colA], layout)).toThrow(/Unknown or deleted/);
  });

  it('does not mutate its inputs', () => {
    const dataSourceColumns = [colA, colB];
    const layout: ViewColumnLayoutItem[] = [{ kind: 'name', visible: true }];
    const dataSourceColumnsCopy = [...dataSourceColumns];
    const layoutCopy = layout.map((item) => ({ ...item }));

    validateColumnLayoutForWrite(dataSourceColumns, layout);

    expect(dataSourceColumns).toEqual(dataSourceColumnsCopy);
    expect(layout).toEqual(layoutCopy);
  });

  describe('system columns (THOTH-078)', () => {
    it('accepts a layout that already includes both system columns unchanged', () => {
      const layout: ViewColumnLayoutItem[] = [
        { kind: 'name', visible: true },
        { kind: 'system', columnId: 'createdAt', visible: true },
        { kind: 'system', columnId: 'lastUpdated', visible: false },
      ];
      const result = validateColumnLayoutForWrite([], layout);
      expect(result).toEqual(layout);
    });

    it('rejects a duplicate system column id', () => {
      const layout: ViewColumnLayoutItem[] = [
        { kind: 'name', visible: true },
        { kind: 'system', columnId: 'createdAt', visible: true },
        { kind: 'system', columnId: 'createdAt', visible: false },
      ];
      expect(() => validateColumnLayoutForWrite([], layout)).toThrow(/Duplicate/);
    });
  });
});
