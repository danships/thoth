// Content fingerprinting: turns "what we wrote" (or "what we read back") into a stable
// `sha256:<hex>` string, so the sync algorithm can tell whether a Thoth object was edited since
// the last import without storing the whole content twice. Two rules make this reliable:
//
// 1. Markdown is normalised (line endings, trailing whitespace) before hashing so that
//    byte-for-byte irrelevant differences never register as an edit.
// 2. Structured payloads (data-source columns, row values) are canonicalised — object keys
//    sorted recursively — before hashing, so JSON key order never registers as an edit.

import { createHash } from 'node:crypto';

export function normalizeMarkdown(markdown: string): string {
  return markdown
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '\n')
    .trim();
}

// Recursively sorts object keys so structurally-identical values hash identically regardless of
// insertion order. Arrays keep their order (order is semantically meaningful for e.g. columns).
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value !== null && typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).toSorted();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function sha256(input: string): string {
  return `sha256:${createHash('sha256').update(input, 'utf8').digest('hex')}`;
}

export function hashMarkdown(markdown: string): string {
  return sha256(normalizeMarkdown(markdown));
}

export function hashJson(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}
