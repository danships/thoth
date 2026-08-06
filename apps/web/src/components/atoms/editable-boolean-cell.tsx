import { Checkbox } from '@mantine/core';

type EditableBooleanCellProperties = {
  value: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function EditableBooleanCell({ value, onChange, disabled = false }: EditableBooleanCellProperties) {
  return <Checkbox checked={value} onChange={(event) => onChange(event.currentTarget.checked)} disabled={disabled} />;
}
