import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useDataSources } from '@/lib/hooks/api/use-data-sources';
import { CreateDataSourceBody, CreateDataSourceResponse, GetDataSourcesResponse } from '@/types/api';
import { ActionIcon, Button, Card, Group, Loader, Select, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSquareX } from '@tabler/icons-react';
import { ChangeEvent, useCallback, useMemo, useState } from 'react';

type Properties = {
  onSelect: (dataSource: GetDataSourcesResponse[number]) => void;
};

export function DataSourceSelector({ onSelect }: Properties) {
  const { data, isLoading } = useDataSources();
  const [dataSourceSelectorEnabled, setDataSourceSelectorEnabled] = useState(true);

  const onSelectDataSource = useCallback(
    (value: string | null) => {
      const dataSource = data?.find((item) => item.id === value);
      if (dataSource) {
        onSelect(dataSource);
      }
    },
    [onSelect, data]
  );

  const dataSourceForm = useForm<{ name: string }>({
    initialValues: { name: '' },
    enhanceGetInputProps: (payload) => {
      if (payload.field !== 'name') {
        return payload;
      }

      return {
        ...payload,
        inputProps: {
          ...payload.inputProps,
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            const { value } = event.target;
            dataSourceForm.setFieldValue('name', value);
            setDataSourceSelectorEnabled(value === '');
          },
        },
      };
    },
  });

  const { post } = useCudApi();
  const handleCreateSubmit = useCallback(
    async (values: { name: string }) => {
      if (!values.name) {
        dataSourceForm.setErrors({ name: 'Name is required' });
        return;
      }

      const createdDataSource = await post<CreateDataSourceResponse, CreateDataSourceBody>('/data-sources', {
        name: values.name,
      });
      onSelect(createdDataSource);
    },
    [dataSourceForm, post, onSelect]
  );

  const dataSourceOptions = useMemo<Array<{ value: string; label: string }> | undefined>(() => {
    if (!data || isLoading) {
      return undefined;
    }
    return data.map(({ id, name }) => ({
      value: id,
      label: name,
    }));
  }, [data, isLoading]);

  return (
    <Card withBorder mt="md">
      <Group align="flex-end">
        {Array.isArray(dataSourceOptions) && dataSourceOptions.length === 0 ? (
          <Title order={3}>Create your first data source</Title>
        ) : (
          <Select
            label="Select an existing Data Source"
            data={dataSourceOptions ?? []}
            onChange={onSelectDataSource}
            disabled={!dataSourceSelectorEnabled}
            nothingFoundMessage="No data sources found"
            style={{ flex: 1 }}
          />
        )}
        {isLoading && <Loader size="sm" />}
      </Group>

      <form onSubmit={dataSourceForm.onSubmit(handleCreateSubmit)}>
        <Stack>
          <TextInput
            mt="md"
            label="Or, create a new data source"
            placeholder="Name"
            rightSection={
              <ActionIcon variant="outline" onClick={() => dataSourceForm.setValues({ name: '' })}>
                <IconSquareX />
              </ActionIcon>
            }
            {...dataSourceForm.getInputProps('name')}
          />
          <Button type="submit">Create</Button>
        </Stack>
      </form>
    </Card>
  );
}
