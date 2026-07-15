import type { DateMode } from '@/types/schemas/entities/container';
import { toInputValue, toIsoFromInput, formatDateValue } from '@/lib/data-source/date-format';

type EditableDateCellProperties = {
  value: string | undefined;
  mode: DateMode;
  displayFormat: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
};

export function EditableDateCell({
  value,
  mode,
  displayFormat,
  onChange,
  disabled = false,
}: EditableDateCellProperties) {
  const inputType = mode === 'datetime' ? 'datetime-local' : mode;
  const inputValue = value ? toInputValue(value, mode) : '';

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const iso = toIsoFromInput(event.target.value, mode);
    onChange(iso);
  };

  if (disabled) {
    return <div style={{ minWidth: 120, padding: '2px 0' }}>{value ? formatDateValue(value, displayFormat) : ''}</div>;
  }

  return (
    <input
      type={inputType}
      value={inputValue}
      onChange={handleChange}
      disabled={disabled}
      style={{ minWidth: 120, border: 'none', background: 'transparent', outline: 'none', cursor: 'text' }}
    />
  );
}
