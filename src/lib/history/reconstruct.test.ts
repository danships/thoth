import assert from 'node:assert/strict';
import { makePatch } from './delta';
import { nearestBaseline, reconstructAt, reconstructValuesAt, type ContentRevisionLike } from './reconstruct';
import type { PageValue } from '@/types/schemas/entities/container';

// --- reconstructAt / nearestBaseline over a chain with snapshot, patch, and consolidated rows ---

const states = ['v1', 'v1 v2', 'v1 v2 v3', 'v1 v2 v3 v4', 'v1 v2 v3 v4 v5'];

const revisions: ContentRevisionLike[] = [
  { sequence: 1, kind: 'snapshot', content: states[0]!, patch: '' },
  { sequence: 2, kind: 'patch', content: '', patch: makePatch(states[0]!, states[1]!) },
  { sequence: 3, kind: 'patch', content: '', patch: makePatch(states[1]!, states[2]!) },
  // A consolidated baseline collapsing what would have been more patches
  { sequence: 4, kind: 'consolidated', content: states[3]!, patch: '' },
  { sequence: 5, kind: 'patch', content: '', patch: makePatch(states[3]!, states[4]!) },
];

for (const [index, state] of states.entries()) {
  const targetSeq = index + 1;
  assert.equal(reconstructAt(revisions, targetSeq), state, `sequence ${targetSeq} should reconstruct to "${state}"`);
}

// nearestBaseline picks the highest baseline <= targetSeq
assert.equal(nearestBaseline(revisions, 1)?.sequence, 1);
assert.equal(nearestBaseline(revisions, 3)?.sequence, 1); // no baseline at 2/3, falls back to 1
assert.equal(nearestBaseline(revisions, 4)?.sequence, 4);
assert.equal(nearestBaseline(revisions, 5)?.sequence, 4);

// Just after a baseline boundary
assert.equal(reconstructAt(revisions, 4), states[3]);
assert.equal(reconstructAt(revisions, 5), states[4]);

// Fallback to nearest preceding baseline on an injected unapplyable patch: the chain is broken
// at sequence 3, so reconstructing sequence 3 (or beyond, within this contiguous replay) returns
// the last good content (the baseline's own content) instead of throwing.
{
  const brokenRevisions: ContentRevisionLike[] = [
    { sequence: 1, kind: 'snapshot', content: 'baseline content', patch: '' },
    { sequence: 2, kind: 'patch', content: '', patch: 'not a valid diff-match-patch patch text at all' },
  ];
  assert.equal(reconstructAt(brokenRevisions, 2), 'baseline content');
}

// reconstructAt with no baseline at all (empty history) returns ''
assert.equal(reconstructAt([], 1), '');

// --- reconstructValuesAt ---

const stringValue = (value: string): PageValue => ({ type: 'string', value });

// Single-change column: revert to its original value
{
  const current = { title: stringValue('final title') };
  const valuesRevisions = [{ sequence: 1, valuesBefore: JSON.stringify({ title: null }) }];
  // targetSeq 0 (before the only change) should undo it back to null (deleted key)
  const atZero = reconstructValuesAt(current, valuesRevisions, 0);
  assert.equal('title' in atZero, false);
  // targetSeq 1 (at/after the change) should equal current
  const atOne = reconstructValuesAt(current, valuesRevisions, 1);
  assert.deepEqual(atOne, current);
}

// Multi-change column: two changes to the same column, roll back correctly through both
{
  const current = { status: stringValue('done') };
  const valuesRevisions = [
    { sequence: 1, valuesBefore: JSON.stringify({ status: null }) },
    { sequence: 2, valuesBefore: JSON.stringify({ status: stringValue('in progress') }) },
  ];
  // Before revision 1: never set
  assert.equal('status' in reconstructValuesAt(current, valuesRevisions, 0), false);
  // Between revision 1 and 2: 'in progress'... wait, sequence 1 introduced some first value.
  // At targetSeq 1 (after rev 1, before rev 2 undoes rev 2's change): should reflect rev 1's
  // resulting state, i.e. whatever rev 2's `valuesBefore` says it replaced -> 'in progress'.
  assert.deepEqual(reconstructValuesAt(current, valuesRevisions, 1), { status: stringValue('in progress') });
  // At/after revision 2: current state
  assert.deepEqual(reconstructValuesAt(current, valuesRevisions, 2), current);
}

// Returns current values when targetSeq === headSeq (no revisions to undo)
{
  const current = { a: stringValue('a'), b: stringValue('b') };
  const valuesRevisions = [{ sequence: 1, valuesBefore: JSON.stringify({ a: null }) }];
  assert.deepEqual(reconstructValuesAt(current, valuesRevisions, 1), current);
}

console.log('✅  reconstruct tests passed');
