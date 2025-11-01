import { Box, Button } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './editable-page-name-cell.module.css';

type EditablePageNameCellProperties = {
  value: string;
  emoji: string | null;
  pageId: string;
  onBlur: (value: string) => void;
  disabled?: boolean;
};

export function EditablePageNameCell({
  value,
  emoji,
  pageId,
  onBlur,
  disabled = false,
}: EditablePageNameCellProperties) {
  const router = useRouter();

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

  const handleLinkClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    router.push(`/pages/${pageId}`);
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
      <Button
        className={styles['pageLinkButton'] ?? ''}
        variant="outline"
        size="sm"
        component={Link}
        href={`/pages/${pageId}`}
        onClick={handleLinkClick}
      >
        OPEN
      </Button>
    </Box>
  );
}
