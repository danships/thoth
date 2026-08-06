import { COALESCE_WINDOW_MS } from './constants';

export type CoalesceHead = {
  author: string;
  coalesceWindowEnd: string; // ISO timestamp
} | null;

/**
 * A save coalesces into the current head revision (updating it in place, extending its
 * `coalesceWindowEnd`) iff a head exists, was authored by the same user, and its coalesce
 * window hasn't expired yet. Otherwise the save appends a brand-new revision.
 */
export function shouldCoalesce(head: CoalesceHead, author: string, now: Date): boolean {
  if (!head) {
    return false;
  }
  if (head.author !== author) {
    return false;
  }
  return now.getTime() < new Date(head.coalesceWindowEnd).getTime();
}

/** The `coalesceWindowEnd` a (re)written head revision should carry, extending from `now`. */
export function nextCoalesceWindowEnd(now: Date): string {
  return new Date(now.getTime() + COALESCE_WINDOW_MS).toISOString();
}
