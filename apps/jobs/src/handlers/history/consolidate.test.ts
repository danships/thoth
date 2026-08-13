import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { makePatch, reconstructAt, type ContentRevisionLike } from '@thoth/shared';
import {
  selectConsolidationRun,
  selectAllConsolidationRuns,
  CONSOLIDATION_AGE_MS,
  type ConsolidationCandidateRevision,
} from './consolidate.js';

describe('consolidate', () => {
  let now = new Date(0);
  let states: string[] = [];
  let candidates: ConsolidationCandidateRevision[] = [];

  const old = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();

  beforeAll(() => {
    now = new Date('2024-06-01T00:00:00.000Z');
    // Build: baseline(1) -> aged patches(2,3,4) -> baseline(5, still old enough to have followed)
    // -> a fresh (non-sealed / recent) patch(6) that should NOT be touched.
    states = ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef'];
    candidates = [
      { id: 'r1', sequence: 1, kind: 'snapshot', createdAt: old(30) },
      { id: 'r2', sequence: 2, kind: 'patch', createdAt: old(29) },
      { id: 'r3', sequence: 3, kind: 'patch', createdAt: old(28) },
      { id: 'r4', sequence: 4, kind: 'patch', createdAt: old(27) },
      { id: 'r5', sequence: 5, kind: 'snapshot', createdAt: old(26) },
      { id: 'r6', sequence: 6, kind: 'patch', createdAt: now.toISOString() },
    ];
  });

  afterAll(() => {
    states = [];
    candidates = [];
    now = new Date(0);
  });

  test('selects the aged run sealed by a following baseline', () => {
    const run = selectConsolidationRun(candidates, now);
    expect(run).toBeTruthy();
    expect(run!.ids).toEqual(['r2', 'r3', 'r4']);
    expect(run!.startSequence).toBe(2);
    expect(run!.endSequence).toBe(4);
    expect(run!.previousSequence).toBe(1);
  });

  test('does not select a trailing run with no closing baseline', () => {
    const withoutClosingBaseline = candidates.filter((candidate) => candidate.id !== 'r5');
    const run = selectConsolidationRun(withoutClosingBaseline, now);
    expect(run).toBeUndefined();
  });

  test('does not select only recent patches after the age cutoff', () => {
    const recentOnly: ConsolidationCandidateRevision[] = [
      { id: 'x1', sequence: 1, kind: 'snapshot', createdAt: now.toISOString() },
      { id: 'x2', sequence: 2, kind: 'patch', createdAt: now.toISOString() },
      { id: 'x3', sequence: 3, kind: 'snapshot', createdAt: now.toISOString() },
    ];
    expect(selectConsolidationRun(recentOnly, now)).toBeUndefined();
  });

  test('preserves reconstructability when a run is consolidated into one row', () => {
    const originalRevisions: ContentRevisionLike[] = [
      { sequence: 1, kind: 'snapshot', content: states[0]!, patch: '' },
      { sequence: 2, kind: 'patch', content: '', patch: makePatch(states[0]!, states[1]!) },
      { sequence: 3, kind: 'patch', content: '', patch: makePatch(states[1]!, states[2]!) },
      { sequence: 4, kind: 'patch', content: '', patch: makePatch(states[2]!, states[3]!) },
      { sequence: 5, kind: 'snapshot', content: states[4]!, patch: '' },
      { sequence: 6, kind: 'patch', content: '', patch: makePatch(states[4]!, states[5]!) },
    ];

    const contentAt4Original = reconstructAt(originalRevisions, 4);
    expect(contentAt4Original).toBe(states[3]);

    const consolidatedRow: ContentRevisionLike = {
      sequence: 4,
      kind: 'consolidated',
      content: contentAt4Original,
      patch: '',
    };
    const consolidatedChain: ContentRevisionLike[] = [
      originalRevisions[0]!,
      consolidatedRow,
      originalRevisions[4]!,
      originalRevisions[5]!,
    ];

    expect(reconstructAt(consolidatedChain, 4)).toBe(reconstructAt(originalRevisions, 4));
    expect(reconstructAt(consolidatedChain, 5)).toBe(reconstructAt(originalRevisions, 5));
    expect(reconstructAt(consolidatedChain, 6)).toBe(reconstructAt(originalRevisions, 6));
  });

  test('uses CONSOLIDATION_AGE_MS as the cutoff', () => {
    expect(CONSOLIDATION_AGE_MS === 24 * 60 * 60 * 1000).toBeTruthy();
  });

  test('selectAllConsolidationRuns finds every sealed run, not just the first', () => {
    const multiRun: ConsolidationCandidateRevision[] = [
      { id: 'a1', sequence: 1, kind: 'snapshot', createdAt: old(50) },
      { id: 'a2', sequence: 2, kind: 'patch', createdAt: old(49) },
      { id: 'a3', sequence: 3, kind: 'snapshot', createdAt: old(48) },
      { id: 'a4', sequence: 4, kind: 'patch', createdAt: old(47) },
      { id: 'a5', sequence: 5, kind: 'snapshot', createdAt: old(46) },
      // Trailing open run: not sealed, must never be returned.
      { id: 'a6', sequence: 6, kind: 'patch', createdAt: now.toISOString() },
    ];
    const runs = selectAllConsolidationRuns(multiRun, now);
    expect(runs.length).toBe(2);
    expect(runs[0]!.ids).toEqual(['a2']);
    expect(runs[1]!.ids).toEqual(['a4']);
  });
});
