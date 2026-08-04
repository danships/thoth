'use client';

import { Group, Stack, Text } from '@mantine/core';
import { EditableColumnValue } from '@/components/molecules/editable-column-value';
import { useNotification } from '@/lib/hooks/use-notification';
import { usePageDetailValueUpdate } from '@/lib/hooks/api/use-page-detail-value-update';
import { useCreateSingleSelectOption } from '@/lib/hooks/api/use-create-single-select-option';
import { getRandomSelectColor } from '@/lib/data-source/select-colors';
import type { Column, PageValue } from '@/types/schemas/entities/container';
import type { GetPageDetailsResponse } from '@/types/api';

type PageFieldsEditorProperties = {
  pageId: string;
  dataSourceId: string | null;
  columns: Column[];
  values: Record<string, PageValue> | undefined;
  mutatePageDetails: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function PageFieldsEditor({
  pageId,
  dataSourceId,
  columns,
  values,
  mutatePageDetails,
}: PageFieldsEditorProperties) {
  const { updateValue, inProgress } = usePageDetailValueUpdate({ mutatePageDetails });
  const { createOption } = useCreateSingleSelectOption(dataSourceId ?? '');
  const { showError } = useNotification();

  const handleChange = async (columnId: string, value: PageValue) => {
    try {
      await updateValue(pageId, columnId, value, dataSourceId);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to save field');
    }
  };

  const handleCreateOption = async (columnId: string, label: string) => {
    const option = await createOption(columnId, { label, color: getRandomSelectColor() });
    if (!option) {
      throw new Error('Failed to create option');
    }
    mutatePageDetails();
    return option;
  };

  if (columns.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      {columns.map((column) => (
        <Group key={column.id} justify="space-between" wrap="nowrap">
          <Text fw={500}>{column.name}</Text>
          <EditableColumnValue
            column={column}
            value={values?.[column.id]}
            onChange={(value) => handleChange(column.id, value)}
            disabled={inProgress}
            onCreateOption={handleCreateOption}
            pageId={pageId}
          />
        </Group>
      ))}
    </Stack>
  );
}
