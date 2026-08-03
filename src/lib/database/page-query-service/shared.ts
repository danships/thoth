/** Builds the JSON path (for `json_extract`/`JSON_EXTRACT`) into a page's dynamic per-column
 * value, e.g. `title` -> `$.values.title.value`. Engine-agnostic: both SQLite and MySQL/MariaDB
 * use the same dot/bracket JSON path syntax. */
export function jsonPath(columnId: string): string {
  return `$.values.${columnId}.value`;
}

// Escapes `%`/`_`/`\` in a `contains`/`notContains` filter value so it's treated as a literal
// substring rather than a LIKE wildcard pattern (e.g. searching for `50%` should not match every
// value starting with `50`).
export function likePattern(value: unknown): string {
  const escaped = String(value).replaceAll(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}
