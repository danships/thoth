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

function escapeMarkdown(text: string): string {
  return text.replaceAll(/([\\`*_{}[\]()#+.!|])/g, String.raw`\$1`);
}

function applyAnnotations(text: string, annotations: NotionRichText['annotations']): string {
  if (!annotations || text.length === 0) {
    return text;
  }
  let result = text;
  if (annotations.code) {
    result = `\`${result}\``;
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
      let formatted = applyAnnotations(plain, segment.annotations);
      if (segment.href && isSafeUrl(segment.href)) {
        formatted = `[${formatted}](${segment.href})`;
      }
      return formatted;
    })
    .join('');
}

export function richTextToPlainText(richText: NotionRichText[] | undefined | null): string {
  if (!richText || richText.length === 0) {
    return '';
  }
  return richText.map((segment) => segment.plain_text).join('');
}
