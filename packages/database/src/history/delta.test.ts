import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { applyPatch, makePatch, summarise } from './delta.js';

// Round-trip: prev -> patch -> apply -> next
function roundTrip(previous: string, next: string) {
  const patch = makePatch(previous, next);
  const result = applyPatch(previous, patch);
  expect(result.ok).toBe(true);
  expect(result.content).toBe(next);
}

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

describe('delta', () => {
  let largePrevious = '';
  let largeNext = '';

  beforeAll(() => {
    largePrevious = 'x'.repeat(500_000);
    largeNext = `${'x'.repeat(499_000)}${'y'.repeat(1000)}`;
  });

  afterAll(() => {
    largePrevious = '';
    largeNext = '';
  });

  test('round-trips basic strings', () => {
    roundTrip('hello world', 'hello brave new world');
    roundTrip('', 'some new text');
    roundTrip('some old text', '');
    roundTrip('identical', 'identical');
  });

  test('round-trips emoji, CJK, and combining marks', () => {
    roundTrip('café 🎉 naïve', 'café 🎉🎊 naïve résumé');
    roundTrip('日本語のテキスト', '日本語の新しいテキストです');
    roundTrip('é', 'é́');
  });

  test('round-trips pseudo-random strings across many seeds', () => {
    for (let index = 0; index < 25; index += 1) {
      const previous = pseudoRandomString(index, 40);
      const next = pseudoRandomString(index + 1000, 45);
      roundTrip(previous, next);
    }
  });

  test('round-trips near-cap large strings', () => {
    roundTrip(largePrevious, largeNext);
  });

  test('returns ok:false on a deliberately corrupted patch', () => {
    const patch = makePatch('hello world', 'hello brave world');
    const corrupted = patch.replace('hello', 'zzzzz zzzzzz zzzzzz zzzzzz');
    const result = applyPatch('completely different unrelated base text that shares nothing', corrupted);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
  });

  test('summarises insert-only changes', () => {
    const summary = summarise('hello', 'hello world');
    expect(summary.charsAdded).toBe(6);
    expect(summary.charsRemoved).toBe(0);
  });

  test('summarises delete-only changes', () => {
    const summary = summarise('hello world', 'hello');
    expect(summary.charsAdded).toBe(0);
    expect(summary.charsRemoved).toBe(6);
  });

  test('summarises mixed edits', () => {
    const summary = summarise('the quick brown fox', 'the slow brown dog');
    expect(summary.charsAdded > 0).toBeTruthy();
    expect(summary.charsRemoved > 0).toBeTruthy();
  });
});
