import { Box } from '@mantine/core';
import styles from './editable-page-name-cell.module.css';

type EditablePageNameCellProperties = {
  value: string;
  emoji: string | null;
  onBlur: (value: string) => void;
  disabled?: boolean;
};

// Pure Name editing (THOTH-052) — the "Open page" navigation link previously rendered here now
// lives in `PageRowActionsCell`, a fixed action gutter that always renders regardless of where
// (or whether) Name appears in the configured `columnLayout`.
export function EditablePageNameCell({ value, emoji, onBlur, disabled = false }: EditablePageNameCellProperties) {
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const text = event.currentTarget.textContent ?? '';
    onBlur(text.trim());
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
    <Box className={styles['editablePageNameCell'] ?? ''}>
      <Box
        className={`${styles['editablePageNameContent'] ?? ''} ${disabled ? (styles['editablePageNameContentDisabled'] ?? '') : (styles['editablePageNameContentEnabled'] ?? '')}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {emoji && <span style={{ marginRight: '8px' }}>{emoji}</span>}
        {value}
      </Box>
    </Box>
  );
}
