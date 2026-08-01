import assert from 'node:assert/strict';
import { applyPatch, makePatch, summarise } from './delta';

// Round-trip: prev -> patch -> apply -> next
function roundTrip(previous: string, next: string) {
  const patch = makePatch(previous, next);
  const result = applyPatch(previous, patch);
  assert.equal(
    result.ok,
    true,
    `expected patch to apply for prev=${JSON.stringify(previous)} next=${JSON.stringify(next)}`
  );
  assert.equal(result.content, next);
}

// Basic round-trips
roundTrip('hello world', 'hello brave new world');
roundTrip('', 'some new text');
roundTrip('some old text', '');
roundTrip('identical', 'identical'); // no-op patch

// Emoji / CJK / combining marks
roundTrip('café 🎉 naïve', 'café 🎉🎊 naïve résumé');
roundTrip('日本語のテキスト', '日本語の新しいテキストです');
roundTrip('e\u0301', 'e\u0301\u0301'); // combining acute accent

// Property-style loop over pseudo-random strings. Split via `Array.from` (iterates by code
// point, not UTF-16 code unit) so multi-code-unit characters (e.g. 🎉) are never sliced into an
// unpaired surrogate, which would produce a string `encodeURI` (used internally by
// `patch_toText`) rejects as malformed.
function pseudoRandomString(seed: number, length: number): string {
  const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFG 🎉日本語'];
  let value = seed;
  let out = '';
  for (let index = 0; index < length; index += 1) {
    value = (value * 1_103_515_245 + 12_345) & 2_147_483_647;
    out += chars[value % chars.length];
  }
  return out;
}

for (let index = 0; index < 25; index += 1) {
  const previous = pseudoRandomString(index, 40);
  const next = pseudoRandomString(index + 1000, 45);
  roundTrip(previous, next);
}

// Near-cap large strings
const largePrevious = 'x'.repeat(500_000);
const largeNext = `${'x'.repeat(499_000)}${'y'.repeat(1000)}`;
roundTrip(largePrevious, largeNext);

// applyPatch returns ok:false on a deliberately corrupted patch
{
  const patch = makePatch('hello world', 'hello brave world');
  const corrupted = patch.replace('hello', 'zzzzz zzzzzz zzzzzz zzzzzz');
  const result = applyPatch('completely different unrelated base text that shares nothing', corrupted);
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
}

// summarise: insert-only
{
  const summary = summarise('hello', 'hello world');
  assert.equal(summary.charsAdded, 6);
  assert.equal(summary.charsRemoved, 0);
}

// summarise: delete-only
{
  const summary = summarise('hello world', 'hello');
  assert.equal(summary.charsAdded, 0);
  assert.equal(summary.charsRemoved, 6);
}

// summarise: mixed edit
{
  const summary = summarise('the quick brown fox', 'the slow brown dog');
  assert.ok(summary.charsAdded > 0);
  assert.ok(summary.charsRemoved > 0);
}

console.log('✅  delta tests passed');
