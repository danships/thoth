import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { makePatch } from './delta.js';
import { nearestBaseline, reconstructAt, reconstructValuesAt, type ContentRevisionLike } from './reconstruct.js';

type TestValue = { type: 'string'; value: string };
const stringValue = (value: string): TestValue => ({ type: 'string', value });

describe('reconstruct', () => {
  let states: string[] = [];
  let revisions: ContentRevisionLike[] = [];

  beforeAll(() => {
    // --- reconstructAt / nearestBaseline over a chain with snapshot, patch, and consolidated rows ---
    states = ['v1', 'v1 v2', 'v1 v2 v3', 'v1 v2 v3 v4', 'v1 v2 v3 v4 v5'];

    revisions = [
      { sequence: 1, kind: 'snapshot', content: states[0]!, patch: '' },
      { sequence: 2, kind: 'patch', content: '', patch: makePatch(states[0]!, states[1]!) },
      { sequence: 3, kind: 'patch', content: '', patch: makePatch(states[1]!, states[2]!) },
      // A consolidated baseline collapsing what would have been more patches
      { sequence: 4, kind: 'consolidated', content: states[3]!, patch: '' },
      { sequence: 5, kind: 'patch', content: '', patch: makePatch(states[3]!, states[4]!) },
    ];
  });

  afterAll(() => {
    states = [];
    revisions = [];
  });

  test('reconstructs every sequence in a mixed baseline and patch chain', () => {
    for (const [index, state] of states.entries()) {
      const targetSeq = index + 1;
      expect(reconstructAt(revisions, targetSeq)).toBe(state);
    }
  });

  test('picks the nearest baseline at or before the target sequence', () => {
    expect(nearestBaseline(revisions, 1)?.sequence).toBe(1);
    expect(nearestBaseline(revisions, 3)?.sequence).toBe(1);
    expect(nearestBaseline(revisions, 4)?.sequence).toBe(4);
    expect(nearestBaseline(revisions, 5)?.sequence).toBe(4);
  });

  test('reconstructs correctly just after a baseline boundary', () => {
    expect(reconstructAt(revisions, 4)).toBe(states[3]);
    expect(reconstructAt(revisions, 5)).toBe(states[4]);
  });

  test('falls back to the nearest preceding baseline on an unapplyable patch', () => {
    const brokenRevisions: ContentRevisionLike[] = [
      { sequence: 1, kind: 'snapshot', content: 'baseline content', patch: '' },
      { sequence: 2, kind: 'patch', content: '', patch: 'not a valid diff-match-patch patch text at all' },
    ];
    expect(reconstructAt(brokenRevisions, 2)).toBe('baseline content');
  });

  test('returns an empty string when reconstructing with no baseline at all', () => {
    expect(reconstructAt([], 1)).toBe('');
  });

  test('reverts a single-change column to its original value', () => {
    const current = { title: stringValue('final title') };
    const valuesRevisions = [{ sequence: 1, valuesBefore: JSON.stringify({ title: null }) }];
    const atZero = reconstructValuesAt(current, valuesRevisions, 0);
    expect('title' in atZero).toBe(false);
    const atOne = reconstructValuesAt(current, valuesRevisions, 1);
    expect(atOne).toEqual(current);
  });

  test('rolls back multiple changes to the same column through the full sequence', () => {
    const current = { status: stringValue('done') };
    const valuesRevisions = [
      { sequence: 1, valuesBefore: JSON.stringify({ status: null }) },
      { sequence: 2, valuesBefore: JSON.stringify({ status: stringValue('in progress') }) },
    ];
    expect('status' in reconstructValuesAt(current, valuesRevisions, 0)).toBe(false);
    expect(reconstructValuesAt(current, valuesRevisions, 1)).toEqual({ status: stringValue('in progress') });
    expect(reconstructValuesAt(current, valuesRevisions, 2)).toEqual(current);
  });

  test('returns current values when targetSeq equals the head sequence', () => {
    const current = { a: stringValue('a'), b: stringValue('b') };
    const valuesRevisions = [{ sequence: 1, valuesBefore: JSON.stringify({ a: null }) }];
    expect(reconstructValuesAt(current, valuesRevisions, 1)).toEqual(current);
  });
});
