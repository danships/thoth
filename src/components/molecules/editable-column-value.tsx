/* eslint-disable unicorn/no-nested-ternary */
import { EditableTextCell } from '@/components/atoms/editable-text-cell';
import { EditableBooleanCell } from '@/components/atoms/editable-boolean-cell';
import { EditableDateCell } from '@/components/atoms/editable-date-cell';
import type { Column, PageValue } from '@/types/schemas/entities/container';

type EditableColumnValueProperties = {
  column: Column;
  value: PageValue | undefined;
  onChange: (value: PageValue) => void;
  disabled?: boolean;
};

/**
 * Renders the appropriate editable control for a column's type/value. Shared between
 * `DataTableRow` (table cell layout) and `PageFieldsEditor` (vertical field layout) so the
 * string/number/boolean/date branching logic only lives in one place.
 */
export function EditableColumnValue({ column, value, onChange, disabled = false }: EditableColumnValueProperties) {
  if (column.type === 'date') {
    return (
      <EditableDateCell
        value={value?.type === 'date' ? value.value : undefined}
        mode={column.mode}
        displayFormat={column.displayFormat}
        onChange={(iso) => onChange({ type: 'date', value: iso })}
        disabled={disabled}
      />
    );
  }

  if (column.type === 'boolean') {
    return (
      <EditableBooleanCell
        value={value?.type === 'boolean' ? value.value : false}
        onChange={(checked) => onChange({ type: 'boolean', value: checked })}
        disabled={disabled}
      />
    );
  }

  return (
    <EditableTextCell
      value={
        column.type === 'number'
          ? typeof value?.value === 'number'
            ? value.value
            : null
          : typeof value?.value === 'string'
            ? value.value
            : null
      }
      onBlur={(newValue) => {
        if (column.type === 'number') {
          onChange({ type: 'number', value: newValue as number });
        } else {
          onChange({ type: 'string', value: newValue as string });
        }
      }}
      disabled={disabled}
      type={column.type}
    />
  );
}
