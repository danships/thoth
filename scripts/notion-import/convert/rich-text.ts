// Converts Notion rich_text[] arrays into inline Markdown (bold/italic/strike/code/links),
// preserving formatting rather than flattening to plain text (THOTH-053 assumption: `string`
// columns/blocks render inline Markdown). Only `http:`/`https:`/`mailto:` link URLs are ever
// embedded — any other scheme is dropped to plain text to avoid constructing unsafe links.

export type NotionRichText = {
  type?: string;
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
};

const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function escapeMarkdown(text: string): string {
  return text.replaceAll(/([\\`*_{}[\]()#+.!|])/g, String.raw`\$1`);
}

// Returns a backtick delimiter strictly longer than the longest run of backticks already present
// in `text`, so wrapping the text in it (as inline code or as a fenced code block) can never be
// prematurely terminated by a backtick run the text itself contains. `minLength` lets callers
// enforce e.g. the 3-backtick minimum for fenced code blocks.
export function backtickDelimiter(text: string, minLength = 1): string {
  const runs = text.match(/`+/g) ?? [];
  let longestRun = 0;
  for (const run of runs) {
    longestRun = Math.max(longestRun, run.length);
  }
  return '`'.repeat(Math.max(longestRun + 1, minLength));
}

// Serializes a single safe Markdown link `[text](url)`. Returns plain (escaped) text if the URL
// scheme isn't allow-listed. URLs containing whitespace or parentheses — which would otherwise
// prematurely close the `(...)` destination — are wrapped in `<...>` per CommonMark's "pointy
// bracket" link destination syntax; the same helper is reused by every place in this script that
// serializes a Notion URL as a Markdown link (rich text, media captions/fallbacks,
// bookmarks/embeds, and database file values), so link/URL escaping only has one implementation.
export function markdownLink(text: string, href: string): string {
  if (!isSafeUrl(href)) {
    return text;
  }
  const needsAngleBrackets = /[\s()]/.test(href);
  const destination = needsAngleBrackets ? `<${href.replaceAll('<', '%3C').replaceAll('>', '%3E')}>` : href;
  return `[${text}](${destination})`;
}

function applyAnnotations(text: string, annotations: NotionRichText['annotations']): string {
  if (!annotations || text.length === 0) {
    return text;
  }
  let result = text;
  if (annotations.code) {
    const delimiter = backtickDelimiter(result);
    result = `${delimiter}${result}${delimiter}`;
  }
  if (annotations.bold) {
    result = `**${result}**`;
  }
  if (annotations.italic) {
    result = `_${result}_`;
  }
  if (annotations.strikethrough) {
    result = `~~${result}~~`;
  }
  return result;
}

export function richTextToMarkdown(richText: NotionRichText[] | undefined | null): string {
  if (!richText || richText.length === 0) {
    return '';
  }

  return richText
    .map((segment) => {
      const plain = segment.annotations?.code ? segment.plain_text : escapeMarkdown(segment.plain_text);
      const formatted = applyAnnotations(plain, segment.annotations);
      return segment.href ? markdownLink(formatted, segment.href) : formatted;
    })
    .join('');
}

export function richTextToPlainText(richText: NotionRichText[] | undefined | null): string {
  if (!richText || richText.length === 0) {
    return '';
  }
  return richText.map((segment) => segment.plain_text).join('');
}
