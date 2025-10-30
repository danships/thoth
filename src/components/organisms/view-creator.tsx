import { CreateDataViewBody, CreateDataViewResponse, GetDataSourcesResponse, GetDataViewsResponse } from '@/types/api';
import { Button, Container, Stepper, Text, TextInput, Title } from '@mantine/core';
import { useCallback, useState } from 'react';
import { DataSourceSelector } from '../molecules/view-creator/data-source-selector';
import { useForm } from '@mantine/form';
import { useCudApi } from '@/lib/hooks/use-cud-api';

type ViewCreatorProperties = {
  pageId: string;
  onCreated: (view: GetDataViewsResponse[number]) => void;
};

export function ViewCreator({ pageId, onCreated }: ViewCreatorProperties) {
  const [activeStep, setActiveStep] = useState(0);

  const [selectedDataSource, setSelectedDataSource] = useState<GetDataSourcesResponse[number] | null>(null);

  const selectDataSource = (dataSource: GetDataSourcesResponse[number]) => {
    setSelectedDataSource(dataSource);
    setActiveStep(1);
  };

  const viewForm = useForm<{ name: string }>({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const { post, inProgress } = useCudApi();
  const doSubmit = useCallback(
    async (values: typeof viewForm.values) => {
      if (!selectedDataSource) {
        return;
      }

      const view = await post<CreateDataViewResponse, CreateDataViewBody>('/views', {
        name: values.name,
        dataSourceId: selectedDataSource.id,
        pageId,
      });

      onCreated(view);
      setActiveStep(2);
    },
    [post, selectedDataSource, onCreated, pageId, viewForm]
  );

  return (
    <Container>
      <Stepper active={activeStep} onStepClick={setActiveStep} allowNextStepsSelect={false}>
        <Stepper.Step label="Data Source" description="Select or create a data source">
          <Text>
            Data stored in Thoth is linked to a data source and displayed using a view. You can create a new data source
            or select an existing one. Once you have selected a data source, you can create a new view to configure what
            and how to display the data.
          </Text>
          <DataSourceSelector onSelect={selectDataSource} />
        </Stepper.Step>
        <Stepper.Step label="Create View">
          <Title order={2}>Using &quot;{selectedDataSource?.name}&quot; as Data Source</Title>
          <form onSubmit={viewForm.onSubmit(doSubmit)}>
            <TextInput required label="View Name" {...viewForm.getInputProps('name')} />
            <Button mt="md" type="submit" loading={inProgress}>
              Create View
            </Button>
          </form>
        </Stepper.Step>
        <Stepper.Completed>Created, lets go!</Stepper.Completed>
      </Stepper>
    </Container>
  );
}
