import type { EntityDefinition } from 'supersave';

export const NAME = 'dataView';

export const DataView: EntityDefinition = {
  name: NAME,
  relations: [
    // {
    //   name: 'dataSource',
    //   field: 'dataSourceId',
    //   multiple: false,
    // },
  ],
  template: {},
  filterSortFields: {
    name: 'string',
    dataSourceId: 'string',
    workspaceId: 'string',
    userId: 'string',
  },
};
