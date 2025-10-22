import {
  type GetPagesTreeQueryVariables,
  type GetPagesTreeResponse,
  getPagesTreeQueryVariablesSchema,
} from "@thoth/types/api";
import { apiRoute } from "../../../core/api/api-route.js";
import { addUserIdToQuery } from "../../database/helpers.js";
import { getContainerRepository } from "../../database/index.js";

export const getPagesTree = apiRoute<
  GetPagesTreeResponse,
  GetPagesTreeQueryVariables
>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
  },
  async ({ query }, session) => {
    const containerRepository = getContainerRepository();
    const dbQuery = addUserIdToQuery(
      containerRepository.createQuery(),
      // TODO add workspaceId to query
      session.user.id
    ).sort("lastUpdated", "desc");

    if (query?.parentId) {
      dbQuery.eq("parentId", query.parentId);
    } /* For reason, see below. else {
      dbQuery.eq("parentId", null);
    } */

    // TODO somehow SuperSave does not return any result if we set parentId to null
    const containers = (await containerRepository.getByQuery(dbQuery)).filter(
      (container) => query?.parentId || !container.parentId
    );

    const parentIds = containers
      .map((container) => container.id)
      .filter((id) => Boolean(id));

    const dbChildren =
      parentIds.length > 0
        ? await containerRepository.getByQuery(
            addUserIdToQuery(
              containerRepository.createQuery(),
              session.user.id
            ).in("parentId", parentIds)
          )
        : [];

    return {
      branches: containers.map((container) => ({
        page: container,
        children: dbChildren
          .filter((child) => child.parentId === container.id)
          .map((child) => ({ page: child })),
      })),
    };
  }
);
