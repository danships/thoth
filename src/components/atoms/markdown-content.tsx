import type { AnchorHTMLAttributes, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeUrlTransform } from '@/lib/markdown/safe-url';
import classes from './markdown-content.module.css';

type MarkdownContentProperties = {
  value: string;
  'data-testid'?: string;
};

// Elements we intentionally support rendering inline. Everything else (headings, lists,
// blockquotes, fenced code blocks, tables, images, etc.) is unwrapped to its children instead of
// being dropped, so the surrounding text of an unsupported block still shows up as plain inline
// text rather than disappearing or producing a multi-line/oversized cell.
const ALLOWED_ELEMENTS = ['p', 'strong', 'em', 'del', 'code', 'a', 'text'];

function MarkdownLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      // Following a rendered link must not also trigger the containing cell's click-to-edit
      // behaviour, so stop the click (and the keyboard-equivalent activation) from bubbling.
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

/**
 * Renders a raw string value as inline Markdown for read-only display purposes (Data View
 * table cells). This is presentation-only: it never mutates or re-serialises the source text,
 * and editing always continues to operate on the literal Markdown string (see
 * `EditableTextCell`) rather than this rendered output.
 *
 * Deliberately restricted to inline formatting (bold, italic, strikethrough, inline code, links)
 * so a cell can never grow into a multi-line block: headings, lists, blockquotes, fenced code,
 * tables, and images are unwrapped to their inline text content rather than rendered as blocks,
 * and raw HTML is never mounted as DOM (no `rehype-raw`, no `dangerouslySetInnerHTML`).
 */
export function MarkdownContent({ value, 'data-testid': testId }: MarkdownContentProperties) {
  if (value.trim() === '') {
    return (
      <span className={classes['empty']} data-testid={testId}>
        {'\u00A0'}
      </span>
    );
  }

  return (
    <span className={classes['root']} data-testid={testId}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrlTransform}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{
          a: MarkdownLink,
        }}
      >
        {value}
      </ReactMarkdown>
    </span>
  );
}
