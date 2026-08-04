// Converts a tree of Notion blocks into Markdown. This module is pure/synchronous: any async
// work (fetching child blocks, uploading files to Thoth) happens beforehand in the orchestrator,
// which attaches `children` and `upload` onto each node before calling `blocksToMarkdown`. This
// keeps the mapping logic itself trivially unit-testable.

import { richTextToMarkdown, richTextToPlainText, isSafeUrl, type NotionRichText } from './rich-text';

export type UploadedFile = { id: string; url: string; filename: string };

export type NotionBlockNode = {
  id: string;
  type: string;
  archived?: boolean | undefined;
  // Raw per-type payload, e.g. `{ rich_text: [...], color: 'default' }` for a paragraph block.
  payload: Record<string, unknown>;
  children?: NotionBlockNode[] | undefined;
  // Populated by the orchestrator for file/image/pdf/video/audio blocks it successfully
  // uploaded to Thoth; `null` if the upload failed (falls back to a link to the Notion URL) or
  // was never attempted (e.g. dry run).
  upload?: UploadedFile | null | undefined;
  // Original Notion-hosted URL, kept as a fallback link target for file-like blocks.
  originalUrl?: string | null | undefined;
};

export type BlockConversionResult = {
  markdown: string;
  unsupportedTypes: string[];
};

const HTML_COMMENT_FILE_TOKEN_TYPES = new Set(['file', 'video', 'audio']);

function fileBlockMarkdown(node: NotionBlockNode, kind: 'image' | 'file' | 'video' | 'audio'): string {
  if (node.upload) {
    if (kind === 'image') {
      return `![${node.upload.filename}](${node.upload.url})`;
    }
    if (HTML_COMMENT_FILE_TOKEN_TYPES.has(kind)) {
      const payload = encodeURIComponent(JSON.stringify({ id: node.upload.id, name: node.upload.filename }));
      return `<!--thoth-file-block:${kind}:${payload}-->`;
    }
  }
  // Degraded fallback: a plain Markdown link to the original Notion-hosted URL.
  if (node.originalUrl && isSafeUrl(node.originalUrl)) {
    return `[${node.upload?.filename ?? kind}](${node.originalUrl})`;
  }
  return '';
}

function indent(markdown: string, prefix = '  '): string {
  return markdown
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

function childrenMarkdown(node: NotionBlockNode, unsupported: string[]): string {
  if (!node.children || node.children.length === 0) {
    return '';
  }
  const converted = node.children.map((child) => convertBlock(child, unsupported)).filter((line) => line.length > 0);
  return converted.length > 0 ? `\n${converted.join('\n\n')}` : '';
}

function convertBlock(node: NotionBlockNode, unsupported: string[]): string {
  if (node.archived) {
    return '';
  }
  const richText = (property: string): NotionRichText[] | undefined =>
    node.payload[property] as NotionRichText[] | undefined;

  switch (node.type) {
    case 'paragraph': {
      return richTextToMarkdown(richText('rich_text')) + childrenMarkdown(node, unsupported);
    }
    case 'heading_1': {
      return `# ${richTextToMarkdown(richText('rich_text'))}`;
    }
    case 'heading_2': {
      return `## ${richTextToMarkdown(richText('rich_text'))}`;
    }
    case 'heading_3': {
      return `### ${richTextToMarkdown(richText('rich_text'))}`;
    }
    case 'quote': {
      return `> ${richTextToMarkdown(richText('rich_text'))}` + childrenMarkdown(node, unsupported);
    }
    case 'callout': {
      // Degraded: callout → blockquote (icon/background colour lost).
      return `> ${richTextToMarkdown(richText('rich_text'))}` + childrenMarkdown(node, unsupported);
    }
    case 'divider': {
      return '---';
    }
    case 'code': {
      const language = typeof node.payload['language'] === 'string' ? node.payload['language'] : '';
      const code = richTextToPlainText(richText('rich_text'));
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case 'equation': {
      return `$$${(node.payload['expression'] as string | undefined) ?? ''}$$`;
    }
    case 'bulleted_list_item': {
      return `- ${richTextToMarkdown(richText('rich_text'))}` + indent(childrenMarkdown(node, unsupported));
    }
    case 'numbered_list_item': {
      return `1. ${richTextToMarkdown(richText('rich_text'))}` + indent(childrenMarkdown(node, unsupported));
    }
    case 'to_do': {
      const checked = Boolean(node.payload['checked']);
      return (
        `- [${checked ? 'x' : ' '}] ${richTextToMarkdown(richText('rich_text'))}` + childrenMarkdown(node, unsupported)
      );
    }
    case 'toggle': {
      // Degraded: toggle → heading + content (collapsibility lost).
      return `#### ${richTextToMarkdown(richText('rich_text'))}` + childrenMarkdown(node, unsupported);
    }
    case 'table': {
      const rows = (node.children ?? []).filter((child) => child.type === 'table_row');
      if (rows.length === 0) {
        return '';
      }
      const cellsOf = (row: NotionBlockNode): string[] =>
        ((row.payload['cells'] as NotionRichText[][] | undefined) ?? []).map((cell) => richTextToMarkdown(cell));
      const [headerRow, ...bodyRows] = rows;
      if (!headerRow) {
        return '';
      }
      const header = cellsOf(headerRow);
      const separator = header.map(() => '---');
      const lines = [
        `| ${header.join(' | ')} |`,
        `| ${separator.join(' | ')} |`,
        ...bodyRows.map((row) => `| ${cellsOf(row).join(' | ')} |`),
      ];
      return lines.join('\n');
    }
    case 'table_row': {
      // Handled inline by the parent `table` case.
      return '';
    }
    case 'image': {
      return fileBlockMarkdown(node, 'image');
    }
    case 'file':
    case 'pdf': {
      return fileBlockMarkdown(node, 'file');
    }
    case 'video': {
      return fileBlockMarkdown(node, 'video');
    }
    case 'audio': {
      return fileBlockMarkdown(node, 'audio');
    }
    case 'bookmark':
    case 'embed':
    case 'link_preview': {
      const url = node.payload['url'] as string | undefined;
      return url && isSafeUrl(url) ? `[${url}](${url})` : '';
    }
    case 'child_page': {
      // Rewritten to a real Thoth link in the orchestrator's link-resolution pass.
      return `{{notion-page-link:${node.id}}}`;
    }
    case 'link_to_page': {
      const target = (node.payload['page_id'] ?? node.payload['database_id']) as string | undefined;
      return target ? `{{notion-page-link:${target}}}` : '';
    }
    case 'synced_block': {
      // Degraded: synced content is inlined once (no cross-page sync semantics in Thoth).
      return childrenMarkdown(node, unsupported).trimStart();
    }
    case 'column_list':
    case 'column': {
      // Degraded: multi-column layout is flattened into a single linear sequence.
      return childrenMarkdown(node, unsupported).trimStart();
    }
    case 'child_database': {
      // Converted separately as a data-source by the orchestrator; leave a link placeholder.
      return `{{notion-page-link:${node.id}}}`;
    }
    case 'table_of_contents':
    case 'breadcrumb': {
      unsupported.push(node.type);
      return '';
    }
    default: {
      unsupported.push(node.type);
      return '';
    }
  }
}

export function blocksToMarkdown(blocks: NotionBlockNode[]): BlockConversionResult {
  const unsupported: string[] = [];
  const markdown = blocks
    .map((block) => convertBlock(block, unsupported))
    .filter((line) => line.length > 0)
    .join('\n\n');
  return { markdown, unsupportedTypes: unsupported };
}
