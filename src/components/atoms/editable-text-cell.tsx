type EditableTextCellProperties = {
  value: string | number | null | undefined;
  onBlur: (value: string | number) => void;
  disabled?: boolean;
  type: 'string' | 'number';
};

export function EditableTextCell({ value, onBlur, disabled = false, type }: EditableTextCellProperties) {
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
