// A curated list of short, URL-safe, programmer-humor words/phrases used to generate a
// friendly, unique-ish default workspace slug at signup (e.g. `ada-lovelace-segfault`).
export const NERDY_SLUG_SUFFIXES: string[] = [
  'segfault',
  'null-pointer',
  'infinite-loop',
  'off-by-one',
  'stack-overflow',
  'race-condition',
  'sudo-mode',
  'byte-me',
  'merge-conflict',
  'cache-invalidator',
  'async-awaited',
  'ctrl-alt-elite',
  'quantum-bug',
  '404-brain',
  'git-blame',
  'tabs-not-spaces',
  'binary-star',
  'recursive-raccoon',
  'cosmic-bitflip',
  'hello-world-2',
  'yak-shaver',
  'bit-flipper',
  'heisenbug',
  'rubber-duck',
  'kernel-panic',
  'zero-day',
  'dark-mode-only',
  'ping-pong-latency',
  'null-island',
  'todo-forever',
];

export function pickRandomNerdySuffix(): string {
  const index = Math.floor(Math.random() * NERDY_SLUG_SUFFIXES.length);
  return NERDY_SLUG_SUFFIXES[index] ?? 'segfault';
}
