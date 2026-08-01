/**
 * Custom (de)serialisation for BlockNote's `file`/`video`/`audio` blocks.
 *
 * Page content is persisted as plain Markdown (never migrated to block JSON), and BlockNote's
 * `blocksToMarkdownLossy()` / `tryParseMarkdownToBlocks()` reliably round-trip `image` blocks but
 * drop or degrade generic `file`/`video`/`audio` blocks (their `url`/`name`/`caption` props don't
 * survive a plain-Markdown round trip). Since these blocks must survive saves, this module wraps
 * BlockNote's own APIs with a pre/post-processing pass:
 *
 * - On save (`serializeBlocksToMarkdown`), the top-level document is split into contiguous runs
 *   of "normal" blocks (serialised via BlockNote as usual) interleaved with individual
 *   `file`/`video`/`audio` blocks, each of which is instead encoded as a stable HTML-comment
 *   token carrying its props as JSON — untouched by BlockNote's lossy Markdown conversion.
 * - On load (`parseMarkdownToBlocks`), the token comments are located, decoded back into
 *   `PartialBlock`s, and the surrounding Markdown text is parsed normally via BlockNote; the
 *   pieces are then reassembled in their original order.
 */

const TOKEN_TYPES = new Set(['file', 'video', 'audio']);
const TOKEN_REGEX = /<!--thoth-file-block:(file|video|audio):(.*?)-->/g;

type FileBlockLike = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown[];
};

// Minimal shape of the BlockNote editor this module needs — kept narrow (rather than importing
// `BlockNoteEditor` directly) so the pure token logic can be unit tested with a stub editor,
// without needing a DOM/ProseMirror environment. Both methods are synchronous in the installed
// BlockNote version (v0.51.4) — matching that here (rather than wrapping in `async`/`Promise`)
// matters: BlockNote's editor mount/selection handling expects `replaceBlocks` to be called in
// the same synchronous tick as the surrounding effect, not deferred to a later microtask.
export type MarkdownBlockEditor = {
  blocksToMarkdownLossy: (blocks?: FileBlockLike[]) => string;
  tryParseMarkdownToBlocks: (markdown: string) => FileBlockLike[];
};

function encodeToken(block: FileBlockLike): string {
  const payload = JSON.stringify(block.props ?? {});
  return `<!--thoth-file-block:${block.type}:${payload}-->`;
}

function decodeToken(type: string, payload: string): FileBlockLike {
  let properties: Record<string, unknown> = {};
  try {
    properties = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    properties = {};
  }
  return { type, props: properties, content: [] };
}

/**
 * Serialises the editor's current top-level document to Markdown, preserving `file`/`video`/
 * `audio` blocks (which BlockNote's own Markdown serialiser drops/degrades) as stable HTML
 * comment tokens embedding their props as JSON.
 */
export function serializeBlocksToMarkdown(editor: MarkdownBlockEditor, document: FileBlockLike[]): string {
  const segments: string[] = [];
  let run: FileBlockLike[] = [];

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }
    const markdown = editor.blocksToMarkdownLossy(run);
    if (markdown.trim().length > 0) {
      segments.push(markdown.trim());
    }
    run = [];
  };

  for (const block of document) {
    if (TOKEN_TYPES.has(block.type)) {
      flushRun();
      segments.push(encodeToken(block));
    } else {
      run.push(block);
    }
  }
  flushRun();

  return segments.join('\n\n');
}

/**
 * Rebuilds an editor document (array of `PartialBlock`-shaped objects) from Markdown previously
 * produced by `serializeBlocksToMarkdown`, reconstructing `file`/`video`/`audio` blocks from
 * their embedded tokens and parsing the remaining text normally via BlockNote.
 */
export function parseMarkdownToBlocks(editor: MarkdownBlockEditor, markdown: string): FileBlockLike[] {
  const blocks: FileBlockLike[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset the shared regex's lastIndex since it carries `g` state across calls.
  TOKEN_REGEX.lastIndex = 0;

  const pushParsedText = (text: string) => {
    if (text.trim().length === 0) {
      return;
    }
    const parsed = editor.tryParseMarkdownToBlocks(text);
    blocks.push(...parsed);
  };

  while ((match = TOKEN_REGEX.exec(markdown)) !== null) {
    const [fullMatch, type, payload] = match;
    pushParsedText(markdown.slice(lastIndex, match.index));
    blocks.push(decodeToken(type!, payload ?? ''));
    lastIndex = match.index + fullMatch.length;
  }
  pushParsedText(markdown.slice(lastIndex));

  return blocks;
}

/** Extracts the file/video/audio token payloads present in a Markdown string, for tests. */
export function extractFileBlockTokens(markdown: string): Array<{ type: string; props: Record<string, unknown> }> {
  const results: Array<{ type: string; props: Record<string, unknown> }> = [];
  const regex = new RegExp(TOKEN_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const [, type, payload] = match;
    try {
      results.push({ type: type!, props: JSON.parse(payload ?? '{}') as Record<string, unknown> });
    } catch {
      results.push({ type: type!, props: {} });
    }
  }
  return results;
}
