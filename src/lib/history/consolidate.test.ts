import assert from 'node:assert/strict';
import { makePatch } from './delta';
import { reconstructAt, type ContentRevisionLike } from './reconstruct';
import { selectConsolidationRun, type ConsolidationCandidateRevision } from './consolidate';
import { CONSOLIDATION_AGE_MS } from './constants';

const now = new Date('2024-06-01T00:00:00.000Z');
const old = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();

// Build: baseline(1) -> aged patches(2,3,4) -> baseline(5, still old enough to have followed)
// -> a fresh (non-sealed / recent) patch(6) that should NOT be touched.
const states = ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef'];
const candidates: ConsolidationCandidateRevision[] = [
  { id: 'r1', sequence: 1, kind: 'snapshot', createdAt: old(30) },
  { id: 'r2', sequence: 2, kind: 'patch', createdAt: old(29) },
  { id: 'r3', sequence: 3, kind: 'patch', createdAt: old(28) },
  { id: 'r4', sequence: 4, kind: 'patch', createdAt: old(27) },
  { id: 'r5', sequence: 5, kind: 'snapshot', createdAt: old(26) },
  { id: 'r6', sequence: 6, kind: 'patch', createdAt: now.toISOString() }, // recent, unsealed
];

// The run between baseline 1 and baseline 5 (sequences 2-4) is entirely older than
// CONSOLIDATION_AGE_MS and sealed by the following baseline -> selected.
{
  const run = selectConsolidationRun(candidates, now);
  assert.ok(run);
  assert.deepEqual(run.ids, ['r2', 'r3', 'r4']);
  assert.equal(run.startSequence, 2);
  assert.equal(run.endSequence, 4);
  assert.equal(run.previousSequence, 1);
}

// A trailing run with no closing baseline yet (the "still growing" run after the last baseline)
// is never selected, even if old — simulate by removing baseline 5 so 5,6 form an open run.
{
  const withoutClosingBaseline = candidates.filter((candidate) => candidate.id !== 'r5');
  const run = selectConsolidationRun(withoutClosingBaseline, now);
  // sequence 6 is recent (not sealed) so still nothing qualifies even though 2-4 do... but 2-4
  // are now followed directly by patch 6 with no baseline between -> run 2..6, whose newest
  // member (6) is recent, so the whole open run is correctly rejected.
  assert.equal(run, undefined);
}

// Only recent patches after the age cutoff: nothing sealed enough to consolidate
{
  const recentOnly: ConsolidationCandidateRevision[] = [
    { id: 'x1', sequence: 1, kind: 'snapshot', createdAt: now.toISOString() },
    { id: 'x2', sequence: 2, kind: 'patch', createdAt: now.toISOString() },
    { id: 'x3', sequence: 3, kind: 'snapshot', createdAt: now.toISOString() },
  ];
  assert.equal(selectConsolidationRun(recentOnly, now), undefined);
}

// Reconstructability: consolidating run r2-r4 into a single consolidated row at sequence 4
// (content = reconstructed content at seq 4) must produce identical content at the boundary and
// at all surviving later sequences (5, 6) as reconstructing against the original, unconsolidated
// chain.
{
  const originalRevisions: ContentRevisionLike[] = [
    { sequence: 1, kind: 'snapshot', content: states[0]!, patch: '' },
    { sequence: 2, kind: 'patch', content: '', patch: makePatch(states[0]!, states[1]!) },
    { sequence: 3, kind: 'patch', content: '', patch: makePatch(states[1]!, states[2]!) },
    { sequence: 4, kind: 'patch', content: '', patch: makePatch(states[2]!, states[3]!) },
    { sequence: 5, kind: 'snapshot', content: states[4]!, patch: '' },
    { sequence: 6, kind: 'patch', content: '', patch: makePatch(states[4]!, states[5]!) },
  ];

  const contentAt4Original = reconstructAt(originalRevisions, 4);
  assert.equal(contentAt4Original, states[3]);

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

  assert.equal(reconstructAt(consolidatedChain, 4), reconstructAt(originalRevisions, 4));
  assert.equal(reconstructAt(consolidatedChain, 5), reconstructAt(originalRevisions, 5));
  assert.equal(reconstructAt(consolidatedChain, 6), reconstructAt(originalRevisions, 6));
}

// Sanity: CONSOLIDATION_AGE_MS constant is used as the cutoff (30h and 27h old both qualify as
// older than 24h; a 1h-old run would not).
assert.ok(CONSOLIDATION_AGE_MS === 24 * 60 * 60 * 1000);

console.log('✅  consolidate tests passed');
