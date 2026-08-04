import { apiRoute } from '@/lib/api/route-wrapper';
import { getDataViewRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { dataViewRetriever } from '@/lib/database/retrievers/data-view-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { assertValidFilterSortRules } from '@/lib/database/page-query-service';
import { validateColumnLayoutForWrite } from '@/lib/data-view/column-layout';
import { withViewLock } from '@/lib/data-view/view-lock';
import { ConflictError } from '@/lib/errors/conflict-error';
import { getLogger } from '@/lib/logger';
import type {
  DeleteViewParameters,
  GetDataViewResponse,
  GetDataViewParameters,
  UpdateDataViewBody,
  UpdateDataViewResponse,
  UpdateDataViewParameters,
} from '@/types/api';
import {
  deleteViewParametersSchema,
  getDataViewParametersSchema,
  updateDataViewBodySchema,
  updateDataViewParametersSchema,
} from '@/types/api';
export const GET = apiRoute<GetDataViewResponse, undefined, GetDataViewParameters>(
  {
    expectedParamsSchema: getDataViewParametersSchema,
  },
  async ({ params }, session) => {
    const dataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataView);

    return {
      id: dataView.id,
      name: dataView.name,
      dataSourceId: dataView.dataSourceId,
      createdAt: dataView.createdAt,
      lastUpdated: dataView.lastUpdated,
      filters: dataView.filters,
      sorts: dataView.sorts,
      columns: dataView.columns,
      columnLayout: dataView.columnLayout,
    };
  }
);

export const PATCH = apiRoute<UpdateDataViewResponse, undefined, UpdateDataViewParameters, UpdateDataViewBody>(
  {
    expectedBodySchema: updateDataViewBodySchema,
    expectedParamsSchema: updateDataViewParametersSchema,
  },
  async ({ body, params }, session) => {
    const dataViewRepository = await getDataViewRepository();

    // Retrieve/authorise/validate/write is serialised per-view (THOTH-052) so two concurrent
    // requests for the same view can't both pass the `expectedLastUpdated` check against the
    // same stale snapshot — see `withViewLock` for the (process-local only) guarantee this
    // provides. Re-fetching the view *inside* the lock (rather than reusing a value read before
    // acquiring it) is what makes the check meaningful.
    const updatedDataView = await withViewLock(params.id, async () => {
      const existingDataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
      await assertGrantAllowsContainerForSession(session, existingDataView, { mutating: true });

      // `columnLayout` and `expectedLastUpdated` are an atomic pair (enforced by the body
      // schema's refinement); a mismatch means the caller loaded this view before a concurrent
      // edit landed elsewhere.
      if (body.columnLayout !== undefined && body.expectedLastUpdated !== existingDataView.lastUpdated) {
        throw new ConflictError('This view has changed since it was loaded. Reload and try again.');
      }

      // If dataSourceId is being updated, verify the new data source exists and belongs to user
      if (body.dataSourceId && body.dataSourceId !== existingDataView.dataSourceId) {
        await dataSourceRetriever.retrieveDataSource(body.dataSourceId, session.user.id);
      }

      // Validate `filters`/`sorts` against the (possibly newly-set) data source's own columns
      // before persisting — an invalid columnId/operator/value combination must 400, not be
      // silently accepted (THOTH-037). Must run whenever `dataSourceId` changes too (not just
      // `filters`/`sorts`), since existing rules may no longer be valid against the new data
      // source's columns; the effective rule set is the body's value when provided, falling back
      // to the existing view's persisted value otherwise.
      if (body.dataSourceId !== undefined || body.filters !== undefined || body.sorts !== undefined) {
        const dataSourceId = body.dataSourceId ?? existingDataView.dataSourceId;
        const dataSource = await dataSourceRetriever.retrieveDataSource(dataSourceId, session.user.id);
        assertValidFilterSortRules(
          dataSource.columns,
          body.filters ?? existingDataView.filters ?? [],
          body.sorts ?? existingDataView.sorts ?? []
        );
      }

      const dataSourceChanging = body.dataSourceId !== undefined && body.dataSourceId !== existingDataView.dataSourceId;

      // A view's `columnLayout`/legacy `columns` reference ids on its *own* Data Source. When
      // that source changes without a replacement layout in the same request, those ids belong
      // to the old source and must be reset rather than silently kept (THOTH-052) — the
      // resolver would otherwise render/hide the new source's unrelated columns by coincidence
      // of id collision (practically impossible, but the stale ids are meaningless regardless).
      let layoutFields: { columnLayout: UpdateDataViewResponse['columnLayout']; columns: string[] } | undefined;
      if (dataSourceChanging && body.columnLayout === undefined) {
        layoutFields = { columnLayout: null, columns: [] };
      } else if (body.columnLayout === null) {
        // Explicit reset back to the default (legacy) resolution — no ids to validate.
        layoutFields = { columnLayout: null, columns: existingDataView.columns };
      } else if (body.columnLayout !== undefined) {
        const effectiveDataSourceId = body.dataSourceId ?? existingDataView.dataSourceId;
        const dataSource = await dataSourceRetriever.retrieveDataSource(effectiveDataSourceId, session.user.id);
        const canonicalLayout = validateColumnLayoutForWrite(dataSource.columns, body.columnLayout);
        // Ordinary layout saves leave the legacy `columns` array (page-field ordering) unchanged.
        layoutFields = { columnLayout: canonicalLayout, columns: existingDataView.columns };
      }

      const filteredBody = Object.fromEntries(
        Object.entries(body).filter(
          ([key, value]) => value !== undefined && key !== 'columnLayout' && key !== 'expectedLastUpdated'
        )
      );

      const updated = await dataViewRepository.update({
        ...existingDataView,
        ...filteredBody,
        ...layoutFields,
        lastUpdated: new Date().toISOString(),
      });

      if (layoutFields) {
        // Audit only identifiers and counts — never the request body, column names, or page
        // values (THOTH-052 Security Considerations).
        const logger = await getLogger();
        logger.info('view.column-layout.update', {
          actorUserId: session.user.id,
          workspaceId: updated.workspaceId,
          viewId: updated.id,
          itemCount: layoutFields.columnLayout?.length ?? 0,
          visibleCount: layoutFields.columnLayout?.filter((item) => item.visible).length ?? 0,
        });
      }

      return updated;
    });

    return {
      id: updatedDataView.id,
      name: updatedDataView.name,
      createdAt: updatedDataView.createdAt,
      lastUpdated: updatedDataView.lastUpdated,
      dataSourceId: updatedDataView.dataSourceId,
      filters: updatedDataView.filters,
      sorts: updatedDataView.sorts,
      columns: updatedDataView.columns,
      columnLayout: updatedDataView.columnLayout,
    } satisfies UpdateDataViewResponse;
  }
);

export const DELETE = apiRoute<void, undefined, DeleteViewParameters, {}>(
  {
    expectedParamsSchema: deleteViewParametersSchema,
  },
  async ({ params }, session) => {
    const dataViewRepository = await getDataViewRepository();
    const dataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataView, { mutating: true });

    const now = new Date().toISOString();
    await dataViewRepository.update({
      ...dataView,
      deletedAt: now,
      deletedRootId: dataView.id,
      lastUpdated: now,
    });

    const logger = await getLogger();
    logger.info('view.delete', {
      actorUserId: session.user.id,
      viewId: dataView.id,
      workspaceId: dataView.workspaceId,
    });
  }
);
