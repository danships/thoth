export const SEED = {
  user: {
    id: 'e2e-user-00000000-0000-0000-0000-000000000001',
    email: 'e2e@test.local',
    name: 'E2E Test User',
    password: 'e2e-test-password',
  },
  session: {
    id: 'e2e-session-0000-0000-0000-000000000001',
    token: 'e2e-session-token-do-not-use-outside-of-tests',
  },
  workspace: {
    id: 'e2e-workspace-000-0000-0000-000000000001',
  },
  pages: {
    root: {
      id: 'e2e-page-root-0000-0000-0000-000000000001',
      name: 'E2E Root Page',
    },
    child: {
      id: 'e2e-page-child-000-0000-0000-000000000001',
      name: 'E2E Child Page',
    },
    dataSourceHost: {
      id: 'e2e-page-dshost-00-0000-0000-000000000001',
      name: 'E2E Data Source Page',
    },
    // A sub-page (child of `root`) that hosts a data source, used to verify that pages
    // nested under that data source's rows still show a breadcrumb trail back to the
    // root and this sub-page, even though rows are stored under the data source
    // container rather than directly under this page.
    breadcrumbDataSourceHost: {
      id: 'e2e-page-bc-dshost-0-0000-0000-000000000001',
      name: 'E2E Breadcrumb Data Source Sub Page',
    },
    deepChain: [
      { id: 'e2e-page-deep-1-00-0000-0000-000000000001', name: 'E2E Deep Page One' },
      { id: 'e2e-page-deep-2-00-0000-0000-000000000001', name: 'E2E Deep Page Two' },
      { id: 'e2e-page-deep-3-00-0000-0000-000000000001', name: 'E2E Deep Page Three' },
      { id: 'e2e-page-deep-4-00-0000-0000-000000000001', name: 'E2E Deep Page Four' },
      { id: 'e2e-page-deep-5-00-0000-0000-000000000001', name: 'E2E Deep Page Five' },
    ],
  },
  dataSource: {
    id: 'e2e-datasource-00-0000-0000-000000000001',
    name: 'E2E Data Source',
    columns: [
      { id: 'e2e-col-text-0000-0000-0000-000000000001', name: 'Notes', type: 'string' as const },
      { id: 'e2e-col-bool-0000-0000-0000-000000000001', name: 'Done', type: 'boolean' as const },
      {
        id: 'e2e-col-date-0000-0000-0000-000000000001',
        name: 'Due Date',
        type: 'date' as const,
        mode: 'date' as const,
        displayFormat: 'YYYY-MM-DD',
      },
      {
        id: 'e2e-col-select-000-0000-0000-000000000001',
        name: 'Priority',
        type: 'single-select' as const,
        options: [
          { id: 'e2e-opt-low-00000-0000-0000-000000000001', label: 'Low', color: 'gray' as const },
          { id: 'e2e-opt-medium-000-0000-0000-000000000001', label: 'Medium', color: 'yellow' as const },
          { id: 'e2e-opt-high-0000-0000-0000-000000000001', label: 'High', color: 'red' as const },
        ],
      },
    ],
  },
  dataView: {
    id: 'e2e-dataview-0000-0000-0000-000000000001',
    name: 'E2E View',
  },
  dataSourcePage: {
    id: 'e2e-page-dsrow-000-0000-0000-000000000001',
    name: 'E2E Data Row',
  },
  breadcrumbDataSource: {
    id: 'e2e-datasource-bc-0-0000-0000-000000000001',
    name: 'E2E Breadcrumb Data Source',
    columns: [{ id: 'e2e-col-bc-text-000-0000-0000-000000000001', name: 'Note', type: 'string' as const }],
  },
  breadcrumbDataView: {
    id: 'e2e-dataview-bc-000-0000-0000-000000000001',
    name: 'E2E Breadcrumb View',
  },
  breadcrumbRowPage: {
    id: 'e2e-page-bc-row-00-0000-0000-000000000001',
    name: 'E2E Breadcrumb Row',
  },
  // Deterministic, CI-safe placeholder images (no dependency on real user-content hosts) used
  // to exercise the page cover editor/banner in the `page-cover.spec.ts` suite.
  coverImage: {
    url: 'https://placehold.co/1200x400',
    urlAlt: 'https://placehold.co/1200x400/png?text=Alt',
  },
  fieldsTab: {
    dataSource: {
      id: 'e2e-datasource-fields-0-0000-000000000001',
      name: 'E2E Fields Data Source',
      columns: [
        { id: 'e2e-col-fields-a-0000-0000-000000000001', name: 'Alpha', type: 'string' as const },
        { id: 'e2e-col-fields-b-0000-0000-000000000001', name: 'Beta', type: 'boolean' as const },
      ],
    },
    // The DataView deliberately lists the columns in the reverse order of the data source's
    // own stored column order, so the Fields tab can be asserted to follow the view's order.
    dataView: {
      id: 'e2e-dataview-fields-0-0000-000000000001',
      name: 'E2E Fields View',
    },
    page: {
      id: 'e2e-page-fields-row-0-0000-000000000001',
      name: 'E2E Fields Row',
    },
  },
} as const;
