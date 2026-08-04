import { describe, expect, it } from 'vitest';
import { resolveDataViewColumnLayout, validateColumnLayoutForWrite } from './column-layout';
import type { Column } from '@/types/schemas/entities/container';
import type { ViewColumnLayoutItem } from '@/types/schemas/entities/data-view';

const colA: Column = { id: 'col-a', name: 'Alpha', type: 'string' };
const colB: Column = { id: 'col-b', name: 'Beta', type: 'string' };
const colC: Column = { id: 'col-c', name: 'Gamma', type: 'string' };

describe('resolveDataViewColumnLayout', () => {
  it('resolves a null layout to Name first, then Data Source order, all visible', () => {
    const result = resolveDataViewColumnLayout([colA, colB, colC], [], null);

    expect(result.all).toEqual([
      { kind: 'name', visible: true },
      { kind: 'data', visible: true, column: colA },
      { kind: 'data', visible: true, column: colB },
      { kind: 'data', visible: true, column: colC },
    ]);
    expect(result.visible).toEqual(result.all);
  });

  it('resolves a null layout using the legacy columns order when provided', () => {
    const result = resolveDataViewColumnLayout([colA, colB, colC], ['col-c', 'col-a'], null);

    expect(result.all.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual([
      'name',
      'col-c',
      'col-a',
      // col-b was never in `columns`, so it's appended at the end.
      'col-b',
    ]);
  });

  it('drops stale ids in the legacy columns array', () => {
    const result = resolveDataViewColumnLayout([colA], ['col-a', 'deleted-col'], null);
    expect(result.all.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual(['name', 'col-a']);
  });

  it('renders Name at its configured (moved) position', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'data', columnId: 'col-a', visible: true },
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-b', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA, colB], [], layout);
    expect(result.all.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual([
      'col-a',
      'name',
      'col-b',
    ]);
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
    expect(result.all.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual([
      'name',
      'col-a',
      'col-b',
      'col-c',
    ]);
    expect(result.visible.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual([
      'name',
      'col-a',
      'col-c',
    ]);
  });

  it('appends a newly added Data Source column visibly at the end', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA, colB], [], layout);
    expect(result.all.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual([
      'name',
      'col-a',
      'col-b',
    ]);
    expect(result.all.at(-1)).toEqual({ kind: 'data', visible: true, column: colB });
  });

  it('drops a stale/deleted column id from an explicit layout', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
      { kind: 'data', columnId: 'deleted-col', visible: true },
    ];
    const result = resolveDataViewColumnLayout([colA], [], layout);
    expect(result.all.map((item) => (item.kind === 'name' ? 'name' : item.column.id))).toEqual(['name', 'col-a']);
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
});

describe('validateColumnLayoutForWrite', () => {
  it('accepts a valid layout and returns it canonicalised', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: false },
    ];
    const result = validateColumnLayoutForWrite([colA], layout);
    expect(result).toEqual(layout);
  });

  it('appends a column added concurrently since the client loaded its layout', () => {
    const layout: ViewColumnLayoutItem[] = [
      { kind: 'name', visible: true },
      { kind: 'data', columnId: 'col-a', visible: true },
    ];
    const result = validateColumnLayoutForWrite([colA, colB], layout);
    expect(result).toEqual([...layout, { kind: 'data', columnId: 'col-b', visible: true }]);
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
});
