'use client';

import dayjs from 'dayjs';

type EditableDateCellProperties = {
  value: string | null | undefined;
  onBlur: (value: string) => void;
  disabled?: boolean;
  options?: {
    dateFormat?: string;
    includeTime?: boolean;
  };
};

export function EditableDateCell({ value, onBlur, disabled = false, options }: EditableDateCellProperties) {
  const includeTime = options?.includeTime ?? false;

  // Convert ISO string to format expected by native inputs
  const getInputValue = () => {
    if (!value) return '';
    const parsed = dayjs(value);
    if (!parsed.isValid()) return '';

    if (includeTime) {
      // datetime-local expects "YYYY-MM-DDTHH:mm"
      return parsed.format('YYYY-MM-DDTHH:mm');
    }
    // date input expects "YYYY-MM-DD"
    return parsed.format('YYYY-MM-DD');
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;

    if (!newValue) {
      onBlur('');
      return;
    }

    const parsedDate = dayjs(newValue);
    if (!parsedDate.isValid()) {
      onBlur(newValue);
      return;
    }

    // Convert to appropriate format
    if (includeTime) {
      onBlur(parsedDate.toISOString());
    } else {
      onBlur(parsedDate.format('YYYY-MM-DD'));
    }
  };

  return (
    <input
      type={includeTime ? 'datetime-local' : 'date'}
      value={getInputValue()}
      onChange={handleChange}
      disabled={disabled}
      style={{
        minWidth: 120,
        padding: '4px 8px',
        border: 'none',
        background: 'transparent',
        outline: 'none',
        fontSize: 'inherit',
        fontFamily: 'inherit',
      }}
    />
  );
}
