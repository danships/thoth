// 30 root-level pages used to exercise cursor-based pagination of the sidebar's root list.
// `lastUpdated` values are assigned (in the seed script) in descending order matching this
// array's order, so page 0 is expected to be the most-recently-updated / first to appear
// (THOTH-042, DECISION 1 — root list ordering moved from per-user `lastAccessedAt` to
// workspace-scoped `lastUpdated`).
const PAGINATION_SEED_COUNT = 30;
const paginationSeed = Array.from({ length: PAGINATION_SEED_COUNT }, (_, index) => ({
  id: `e2e-page-pag-${String(index).padStart(2, '0')}-0000-0000-000000000001`,
  name: `E2E Pagination Page ${String(index).padStart(2, '0')}`,
}));

// A root page with more children than CHILD_PREVIEW_LIMIT (10), used to verify the sidebar
// shows a "more inside" indicator instead of listing/paginating all of them inline.
const CHILD_OVERFLOW_COUNT = 12;
const childOverflowChildren = Array.from({ length: CHILD_OVERFLOW_COUNT }, (_, index) => ({
  id: `e2e-page-cof-child-${String(index).padStart(2, '0')}-000000000001`,
  name: `E2E Overflow Child ${String(index).padStart(2, '0')}`,
}));

// A pool of root-level pages seeded unstarred, starred on-demand by the favorites-overflow
// spec (via `PUT /pages/:id/favorite`) to exceed `FAVORITES_MAX_LIMIT` (50) and verify the
// "may be more" indicator, then unstarred again at the end of that test so other specs (e.g.
// the "no favorites" empty-state assertion) aren't affected by leftover starred state.
const FAVORITES_OVERFLOW_COUNT = 55;
const favoritesOverflowSeed = Array.from({ length: FAVORITES_OVERFLOW_COUNT }, (_, index) => ({
  id: `e2e-page-fav-of-${String(index).padStart(2, '0')}-000-0000-000000000001`,
  name: `E2E Favorites Overflow Page ${String(index).padStart(2, '0')}`,
}));

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
  // A second member of `SEED.workspace` (not `secondWorkspace`), seeded with `read_write`
  // permission and full (`workspace`) scope. Used, along with `thirdUser`, to exercise
  // THOTH-042's multi-user access model: a fellow workspace member can read/write content
  // created by another member, without being its creator.
  secondUser: {
    id: 'e2e-user-00000000-0000-0000-0000-000000000002',
    email: 'e2e-member@test.local',
    name: 'E2E Second Member',
    password: 'e2e-test-password-2',
  },
  secondUserSession: {
    id: 'e2e-session-0000-0000-0000-000000000002',
    token: 'e2e-second-session-token-do-not-use-outside-of-tests',
  },
  // A third member of `SEED.workspace`, seeded with `read`-only permission and full
  // (`workspace`) scope. Used to verify read-only members can view but not mutate shared
  // content, and that non-members of `secondWorkspace` are correctly denied access to it.
  thirdUser: {
    id: 'e2e-user-00000000-0000-0000-0000-000000000003',
    email: 'e2e-readonly@test.local',
    name: 'E2E Third Member',
    password: 'e2e-test-password-3',
  },
  thirdUserSession: {
    id: 'e2e-session-0000-0000-0000-000000000003',
    token: 'e2e-third-session-token-do-not-use-outside-of-tests',
  },
  workspace: {
    id: 'e2e-workspace-000-0000-0000-000000000001',
    slug: 'e2e-workspace',
    // Deliberately small (1 MB) so `workspace-storage-quota.spec.ts` can exercise the
    // "storage limit reached" (409) path without needing a multi-MB upload fixture.
    storageQuotaBytes: 1_048_576,
  },
  // A second, independent workspace owned by the same seed user, used to exercise
  // multi-workspace switching, data isolation, and slug/redirect behaviour (THOTH-027). It is
  // seeded with its own root Welcome page so isolation assertions have something to look at.
  secondWorkspace: {
    id: 'e2e-workspace-002-0000-0000-000000000001',
    slug: 'e2e-workspace-two',
    rootPage: {
      id: 'e2e-page-ws2-root-0-0000-0000-000000000001',
      name: 'E2E Second Workspace Home',
    },
  },
  pages: {
    root: {
      id: 'e2e-page-root-0000-0000-0000-000000000001',
      name: 'E2E Root Page',
      // Known markdown seeded onto this page's body, used to verify markdown -> BlockNote
      // block hydration renders a heading element on the Contents tab.
      contentHeading: 'E2E Content Heading',
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
    paginationSeed,
    childOverflowHost: {
      id: 'e2e-page-cof-host-0-0000-0000-000000000001',
      name: 'E2E Child Overflow Host',
      children: childOverflowChildren,
    },
    // A dedicated, always-unstarred-by-default root page used by the star/unstar toggle spec,
    // kept separate from `root` so toggling favorite state here never affects other specs that
    // rely on `SEED.pages.root`'s access/ordering fixtures.
    favoriteToggle: {
      id: 'e2e-page-fav-tog-0-0000-0000-000000000001',
      name: 'E2E Favorite Toggle Page',
    },
    favoritesOverflowSeed,
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
      {
        id: 'e2e-col-multi-000-0000-0000-000000000001',
        name: 'Tags',
        type: 'multi-select' as const,
        options: [
          { id: 'e2e-opt-frontend-0-0000-0000-000000000001', label: 'Frontend', color: 'blue' as const },
          { id: 'e2e-opt-backend-00-0000-0000-000000000001', label: 'Backend', color: 'teal' as const },
          { id: 'e2e-opt-urgent-000-0000-0000-000000000001', label: 'Urgent', color: 'red' as const },
        ],
      },
    ],
    // THOTH-053: named inline-Markdown expectations, seeded onto a page kept separate from
    // `dataSourcePage` (which specs mutate via inline edit) so Markdown-rendering assertions never
    // race with — or get clobbered by — tests that overwrite the "Notes" cell's raw text.
    markdown: {
      raw: 'This is **bold**, *emphasis*, ~~strike~~, `code`, and a [link](https://example.com/thoth).',
      boldText: 'bold',
      emphasisText: 'emphasis',
      strikeText: 'strike',
      codeText: 'code',
      linkText: 'link',
      linkHref: 'https://example.com/thoth',
    },
    markdownRow: {
      id: 'e2e-page-dsrow-md-0-0000-0000-000000000001',
      name: 'E2E Markdown Row',
    },
    // A very long single-line Markdown value (with inline code) used to verify the rendered cell
    // stays on one line and ellipsises rather than growing the row/table/document width.
    longMarkdown: {
      raw: `Lorem ipsum dolor sit amet **consectetur adipiscing** elit, \`sed do eiusmod tempor\` incididunt ut labore et dolore magna aliqua ${'ultra-long-word-'.repeat(10)}end.`,
    },
    longMarkdownRow: {
      id: 'e2e-page-dsrow-long-0-0000-0000-000000000001',
      name: 'E2E Long Markdown Row',
    },
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
      // Deliberately Markdown-looking raw text (THOTH-053 regression fixture): the Fields tab
      // must keep showing this literally, punctuation and all, never rendered as bold.
      alphaValue: '**Initial** alpha',
    },
  },
  // A pre-seeded `uploaded-file` + `file-usage` row (with a matching byte file written into the
  // test storage folder by `scripts/end-to-end-seed.ts`), used to exercise the serve endpoint
  // and the visibility/quota specs without needing to actually perform an upload first.
  file: {
    id: 'e2e-file-00000000-0000-0000-0000-000000000001',
    filename: 'e2e-seed-file.txt',
    mimeType: 'text/plain',
    content: 'E2E seeded file content',
    page: {
      id: 'e2e-page-file-host-0-0000-0000-000000000001',
      name: 'E2E File Host Page',
    },
  },
  // A dedicated root page, owned by the primary seed user, used exclusively by
  // `workspaces/shared-workspace-access.spec.ts` (THOTH-042, DECISION 4) to assert the
  // read / read_write / read-only / non-member access matrix — kept separate from every other
  // fixture so mutation attempts by other members never affect unrelated specs.
  sharedAccess: {
    page: {
      id: 'e2e-page-shared-acc-0-0000-0000-000000000001',
      name: 'E2E Shared Access Page',
    },
  },
  // A dedicated data source + view + row set for THOTH-037's filter/sort e2e coverage, kept
  // fully separate from `SEED.dataSource`/`SEED.dataView` (which only seed a single row) so
  // filter/sort assertions have multiple, deterministic rows to select amongst without any risk
  // of interfering with other data-view specs that rely on the single-row fixture.
  filterSort: {
    host: {
      id: 'e2e-page-fs-host-00-0000-0000-000000000001',
      name: 'E2E Filter Sort Host',
    },
    dataSource: {
      id: 'e2e-datasource-fs-0-0000-0000-000000000001',
      name: 'E2E Filter Sort Data Source',
      columns: [
        { id: 'e2e-col-fs-name-000-0000-0000-000000000001', name: 'Label', type: 'string' as const },
        { id: 'e2e-col-fs-score-00-0000-0000-000000000001', name: 'Score', type: 'number' as const },
        { id: 'e2e-col-fs-active-0-0000-0000-000000000001', name: 'Active', type: 'boolean' as const },
        {
          id: 'e2e-col-fs-due-000-0000-0000-000000000001',
          name: 'Due',
          type: 'date' as const,
          mode: 'date' as const,
          displayFormat: 'YYYY-MM-DD',
        },
        {
          id: 'e2e-col-fs-prio-00-0000-0000-000000000001',
          name: 'Priority',
          type: 'single-select' as const,
          options: [
            { id: 'e2e-opt-fs-low-0000-0000-000000000001', label: 'Low', color: 'gray' as const },
            { id: 'e2e-opt-fs-med-0000-0000-000000000001', label: 'Medium', color: 'yellow' as const },
            { id: 'e2e-opt-fs-high-000-0000-000000000001', label: 'High', color: 'red' as const },
          ],
        },
        {
          id: 'e2e-col-fs-tags-00-0000-0000-000000000001',
          name: 'Tags',
          type: 'multi-select' as const,
          options: [
            { id: 'e2e-opt-fs-fe-0000-0000-000000000001', label: 'Frontend', color: 'blue' as const },
            { id: 'e2e-opt-fs-be-0000-0000-000000000001', label: 'Backend', color: 'teal' as const },
            { id: 'e2e-opt-fs-urg-000-0000-000000000001', label: 'Urgent', color: 'red' as const },
          ],
        },
      ],
    },
    dataView: {
      id: 'e2e-dataview-fs-000-0000-0000-000000000001',
      name: 'E2E Filter Sort View',
    },
    // Row definitions for filter/sort matrix tests.
    // - Rows a-d keep the original Apple/Banana/cherry/Date expectations for backward compat.
    // - Rows e-h add coverage for: negative/zero scores, missing values, booleans, dates,
    //   single-select, multi-select with overlapping tags, empty multi-select, etc.
    // - Row d has no Score (NULL), row f has score=0, row g has score=-5.
    // - Row h has no values at all (all columns missing).
    rows: [
      {
        id: 'e2e-page-fs-row-a-0-0000-0000-000000000001',
        name: 'Apple',
        score: 10,
        active: true,
        due: '2025-06-15',
        priority: 'e2e-opt-fs-high-000-0000-000000000001' as const,
        tags: ['e2e-opt-fs-fe-0000-0000-000000000001', 'e2e-opt-fs-urg-000-0000-000000000001'] as const,
      },
      {
        id: 'e2e-page-fs-row-b-0-0000-0000-000000000001',
        name: 'Banana',
        score: 30,
        active: false,
        due: '2025-03-01',
        priority: 'e2e-opt-fs-low-0000-0000-000000000001' as const,
        tags: ['e2e-opt-fs-be-0000-0000-000000000001'] as const,
      },
      {
        id: 'e2e-page-fs-row-c-0-0000-0000-000000000001',
        name: 'cherry',
        score: 20,
        active: true,
        due: '2025-06-15',
        priority: 'e2e-opt-fs-med-0000-0000-000000000001' as const,
        tags: ['e2e-opt-fs-fe-0000-0000-000000000001', 'e2e-opt-fs-be-0000-0000-000000000001'] as const,
      },
      {
        id: 'e2e-page-fs-row-d-0-0000-0000-000000000001',
        name: 'Date',
        score: null,
        active: null,
        due: null,
        priority: null,
        tags: null,
      },
      {
        id: 'e2e-page-fs-row-e-0-0000-0000-000000000001',
        name: 'elderberry',
        score: 10,
        active: false,
        due: '2025-01-01',
        priority: 'e2e-opt-fs-high-000-0000-000000000001' as const,
        tags: [] as readonly string[],
      },
      {
        id: 'e2e-page-fs-row-f-0-0000-0000-000000000001',
        name: 'Fig',
        score: 0,
        active: true,
        due: '2025-12-31',
        priority: 'e2e-opt-fs-low-0000-0000-000000000001' as const,
        tags: ['e2e-opt-fs-fe-0000-0000-000000000001'] as const,
      },
      {
        id: 'e2e-page-fs-row-g-0-0000-0000-000000000001',
        name: 'grape',
        score: -5,
        active: false,
        due: '2025-06-15',
        priority: null,
        tags: ['e2e-opt-fs-urg-000-0000-000000000001'] as const,
      },
      {
        id: 'e2e-page-fs-row-h-0-0000-0000-000000000001',
        name: 'Honeydew',
        score: null,
        active: null,
        due: null,
        priority: null,
        tags: null,
      },
    ],
  },
} as const;
