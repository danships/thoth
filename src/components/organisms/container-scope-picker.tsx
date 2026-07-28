'use client';

import { MultiSelect, Loader } from '@mantine/core';
import { usePagesTree } from '@/lib/hooks/api/use-pages-tree';
import { useDataSources } from '@/lib/hooks/api/use-data-sources';

type ContainerScopePickerProperties = {
  value: string[];
  onChange: (containerIds: string[]) => void;
};

// Flat picker over root-level pages and data sources in the current workspace. Deliberately
// simplified vs. a full nested tree: `scopeType: 'containers_with_children'` already resolves
// descendants dynamically (see `resolveContainerDescendants`), so picking a root here is enough
// to grant access to everything beneath it without needing a recursive UI.
export function ContainerScopePicker({ value, onChange }: ContainerScopePickerProperties) {
  const { branches, isLoading: pagesLoading } = usePagesTree();
  const { data: dataSources, isLoading: dataSourcesLoading } = useDataSources();

  const options = [
    ...branches.map((branch) => ({ value: branch.page.id, label: `📄 ${branch.page.name}` })),
    ...(dataSources ?? []).map((dataSource) => ({ value: dataSource.id, label: `🗂️ ${dataSource.name}` })),
  ];

  return (
    <MultiSelect
      label="Containers"
      description="Pages and data sources this App can access"
      placeholder={pagesLoading || dataSourcesLoading ? 'Loading…' : 'Select containers'}
      data={options}
      value={value}
      onChange={onChange}
      searchable
      rightSection={pagesLoading || dataSourcesLoading ? <Loader size="xs" /> : undefined}
    />
  );
}
