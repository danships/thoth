'use client';

import { useEffect, useRef, useState } from 'react';
import { MarkdownContent } from '@/components/atoms/markdown-content';
import styles from './editable-text-cell.module.css';

type EditableTextCellProperties = {
  value: string | number | null | undefined;
  onBlur: (value: string | number) => void;
  disabled?: boolean;
  type: 'string' | 'number';
  /**
   * When `true` (string columns only), the resting/display state renders the value as inline
   * Markdown (see `MarkdownContent`) while editing still exposes and commits the literal source
   * text — this is a Data View presentation concern, not a Markdown editor. Defaults to `false`
   * so number columns and every existing caller keep the plain `contentEditable` behaviour used
   * by, e.g., the row page's Fields editor (`page-fields-editor.tsx`), which deliberately stays
   * raw/plain regardless of this flag.
   */
  renderMarkdown?: boolean;
  /** Column name, used to build an accessible label for the Markdown edit control. */
  columnName?: string;
};

const CR_LF = /\r\n|\r|\n/g;

export function EditableTextCell({
  value,
  onBlur,
  disabled = false,
  type,
  renderMarkdown = false,
  columnName,
}: EditableTextCellProperties) {
  if (type === 'string' && renderMarkdown) {
    return (
      <MarkdownTextCell
        value={typeof value === 'string' ? value : ''}
        onBlur={onBlur}
        disabled={disabled}
        columnName={columnName}
      />
    );
  }

  return <PlainTextCell value={value} onBlur={onBlur} disabled={disabled} type={type} />;
}

function PlainTextCell({
  value,
  onBlur,
  disabled = false,
  type,
}: Omit<EditableTextCellProperties, 'renderMarkdown' | 'columnName'>) {
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const text = event.currentTarget.textContent ?? '';
    if (type === 'number') {
      const previousDisplay = value == null ? '' : String(value);

      if (text.trim() === '') {
        event.currentTarget.textContent = previousDisplay;
        return;
      }

      const numberValue = Number(text);

      if (Number.isNaN(numberValue)) {
        event.currentTarget.textContent = previousDisplay;
        return;
      }

      onBlur(numberValue);
    } else {
      onBlur(text);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      // Enter alone: confirm the value (blur the element)
      event.preventDefault();
      event.currentTarget.blur();
    } else if (
      (event.key === 'Enter' && event.shiftKey) ||
      (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
    ) {
      // Shift+Enter or Ctrl/Cmd+Enter: insert new line
      event.preventDefault();
      const selection = globalThis.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const br = document.createTextNode('\n');
        range.insertNode(br);
        range.setStartAfter(br);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  return (
    <div
      contentEditable={!disabled}
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{ minWidth: 120, outline: 'none', cursor: disabled ? 'default' : 'text' }}
    >
      {value == null ? '' : String(value)}
    </div>
  );
}

type MarkdownTextCellProperties = {
  value: string;
  onBlur: (value: string) => void;
  disabled?: boolean;
  columnName?: string | undefined;
};

/**
 * String cell used by Data View tables: at rest it renders the value as inline Markdown
 * (`MarkdownContent`); activating edit mode (click, the labelled edit control, or Enter/Space
 * when focused) swaps in a single-line `contentEditable` raw-text editor exposing the exact
 * Markdown source — never the rendered `textContent`. This is not a Markdown editor: only the
 * display state interprets Markdown, and committing always writes back the literal source string.
 */
function MarkdownTextCell({ value, onBlur, disabled = false, columnName }: MarkdownTextCellProperties) {
  const [editing, setEditing] = useState(false);
  // Local draft mirrors the last-known-good source text. It's kept in sync with `value` while not
  // editing (including after SWR revalidation or a failed save reverting the prop), and updated to
  // the submitted text on commit so the display doesn't flicker back to the pre-edit value while
  // waiting for that revalidation to arrive. Synchronised during render (rather than in a
  // `useEffect`) following React's "adjusting state when a prop changes" pattern, so an incoming
  // prop update while at rest is reflected in the same render instead of causing an extra one.
  const [draft, setDraft] = useState(value);
  const [lastSyncedValue, setLastSyncedValue] = useState(value);

  if (!editing && lastSyncedValue !== value) {
    setLastSyncedValue(value);
    setDraft(value);
  }

  const editableReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && editableReference.current) {
      const element = editableReference.current;
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = globalThis.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editing]);

  const startEditing = () => {
    if (disabled) {
      return;
    }
    setEditing(true);
  };

  const commit = (text: string) => {
    setEditing(false);
    setDraft(text);
    if (text !== value) {
      onBlur(text);
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    commit(event.currentTarget.textContent ?? '');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Unlike the plain editor, every Enter variant commits: this is a single-line raw-source
    // editor, so none of them should ever insert a newline.
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(event.currentTarget.textContent ?? '');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      event.preventDefault();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain').replaceAll(CR_LF, ' ');
    const selection = globalThis.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  if (editing) {
    return (
      <div
        ref={editableReference}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}
        style={{ minWidth: 120, outline: 'none', cursor: 'text', whiteSpace: 'nowrap', overflow: 'hidden' }}
      >
        {draft}
      </div>
    );
  }

  return (
    <div
      className={styles['markdownTarget'] ?? ''}
      onClick={startEditing}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? -1 : 0}
      aria-label={disabled ? undefined : `Edit ${columnName ?? 'value'}`}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startEditing();
        }
      }}
    >
      <MarkdownContent value={draft} />
    </div>
  );
}
