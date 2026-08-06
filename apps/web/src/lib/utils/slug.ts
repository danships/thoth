export const RESERVED_WORKSPACE_SLUGS = ['new', 'api', 'pages', 'login', 'signup', 'workspaces'] as const;

/**
 * Converts arbitrary text into a URL-safe slug: lowercase, alphanumeric segments joined by
 * single hyphens. Falls back to `'workspace'` if the input contains no usable characters
 * (e.g. an all-emoji or all-punctuation name).
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .replaceAll(/-{2,}/g, '-');

  if (slug.length < 3) {
    return 'workspace';
  }

  return slug.slice(0, 50);
}

export function isReservedWorkspaceSlug(slug: string): boolean {
  return (RESERVED_WORKSPACE_SLUGS as readonly string[]).includes(slug);
}
