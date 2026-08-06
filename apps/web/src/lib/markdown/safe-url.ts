// Explicit allow-list of URL schemes we consider safe to render as an actionable `href`. Kept as
// a pure, DOM-independent function so it is directly unit-testable and can be reused by both the
// `react-markdown` `urlTransform` option and any future Markdown rendering surface.
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

// Matches ASCII control characters (including tab/newline/carriage-return) that can be used to
// obfuscate a scheme, e.g. "java\tscript:alert(1)". Stripping them before inspecting the scheme
// mirrors how browsers historically parsed (and attackers abused) `javascript:` URLs.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/**
 * Returns `url` unchanged when it is safe to render as a clickable link, or an empty string
 * otherwise. Safe URLs are relative paths, fragment identifiers (`#...`), and absolute URLs using
 * the `http:`, `https:`, or `mailto:` schemes (case-insensitive, with optional surrounding
 * whitespace and embedded control characters stripped before the scheme check). Every other
 * scheme — including `javascript:`, `data:`, `vbscript:`, and `file:` — is rejected.
 */
export function safeUrlTransform(url: string): string {
  const trimmed = url.trim();

  if (trimmed === '') {
    return '';
  }

  // Relative URLs (no scheme) and fragment-only links are always safe: the browser resolves them
  // against the current document rather than invoking a scheme handler.
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('?')) {
    return url;
  }

  const withoutControlCharacters = trimmed.replaceAll(CONTROL_CHARACTERS, '');
  const schemeMatch = /^([a-zA-Z][a-zA-Z\d+.-]*):/.exec(withoutControlCharacters);

  if (!schemeMatch) {
    // No recognisable scheme prefix (e.g. "path/to/page", "www.example.com") — treat as relative.
    return url;
  }

  const scheme = `${schemeMatch[1]!.toLowerCase()}:`;

  return ALLOWED_SCHEMES.has(scheme) ? trimmed : '';
}
