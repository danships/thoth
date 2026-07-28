'use client';

import { MultiSelect, Loader } from '@mantine/core';
import { useDataSources } from '@/lib/hooks/api/use-data-sources';

type DataSourceScopePickerProperties = {
  value: string[];
  onChange: (dataSourceIds: string[]) => void;
};

// Flat picker over data sources in the current workspace. Pages are deliberately not
// selectable here — a page's App scope is managed from the page detail screen itself (via the
// "Apps" menu), not from the App settings form, so an App can be granted access to individual
// pages without needing to know their ids up front.
export function DataSourceScopePicker({ value, onChange }: DataSourceScopePickerProperties) {
  const { data: dataSources, isLoading: dataSourcesLoading } = useDataSources();

  const options = (dataSources ?? []).map((dataSource) => ({ value: dataSource.id, label: dataSource.name }));

  return (
    <MultiSelect
      label="Data sources"
      description="Data sources this App can access. To grant access to specific pages, open the page and use its Apps menu."
      placeholder={dataSourcesLoading ? 'Loading…' : 'Select data sources'}
      data={options}
      value={value}
      onChange={onChange}
      searchable
      rightSection={dataSourcesLoading ? <Loader size="xs" /> : undefined}
    />
  );
}
