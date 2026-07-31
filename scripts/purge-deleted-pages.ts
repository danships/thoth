import 'dotenv/config';
import { getContainerRepository, getDataViewRepository, getDatabase } from '../src/lib/database/index.js';
import { getPageDeleteGracePeriodDays } from '../src/lib/database/page-grace-period.js';
import { permanentlyDeleteByDeletedRootId } from '../src/lib/database/soft-delete-service.js';

const RACE_SAFETY_MARGIN_MS = 60 * 60 * 1000;

function isPastGracePeriod(deletedAt: string, graceThreshold: number): boolean {
  const deletedAtMs = Date.parse(deletedAt);
  return !Number.isNaN(deletedAtMs) && deletedAtMs <= graceThreshold;
}

function isOutsideRaceSafetyMargin(lastUpdated: string): boolean {
  const lastUpdatedMs = Date.parse(lastUpdated);
  return Number.isNaN(lastUpdatedMs) || lastUpdatedMs <= Date.now() - RACE_SAFETY_MARGIN_MS;
}

async function purgeDeletedPages() {
  await getDatabase();

  const gracePeriodDays = await getPageDeleteGracePeriodDays();
  const graceThreshold = Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000;

  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();
  const allContainers = await containerRepository.getByQuery(containerRepository.createQuery());
  const allDataViews = await dataViewRepository.getByQuery(dataViewRepository.createQuery());

  const containerRoots = allContainers.filter((container) => container.deletedAt && container.deletedRootId === container.id);
  const dataViewRoots = allDataViews.filter((dataView) => dataView.deletedAt && dataView.deletedRootId === dataView.id);

  let purgedCount = 0;

  for (const root of [...containerRoots, ...dataViewRoots]) {
    if (!root.deletedAt || !isPastGracePeriod(root.deletedAt, graceThreshold)) {
      continue;
    }

    if (!isOutsideRaceSafetyMargin(root.lastUpdated)) {
      continue;
    }

    if ('type' in root) {
      const revalidated = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', root.id));
      if (
        !revalidated ||
        !revalidated.deletedAt ||
        revalidated.deletedRootId !== revalidated.id ||
        !isPastGracePeriod(revalidated.deletedAt, graceThreshold)
      ) {
        continue;
      }

      // `permanentlyDeleteByDeletedRootId` re-verifies `deletedAt` for every record it resolves
      // (including the root) immediately before deleting it, so a restore racing with this
      // revalidation still can't cause an already-restored record to be deleted. SuperSave has
      // no transaction support, so this per-record re-check right before the delete is the
      // closest available approximation of atomicity between the two operations.
      await permanentlyDeleteByDeletedRootId(revalidated.id, revalidated.userId, revalidated.workspaceId);
      purgedCount += 1;
      console.log(`Purged ${revalidated.type} ${revalidated.id} (${revalidated.name})`);
      continue;
    }

    const revalidated = await dataViewRepository.getOneByQuery(dataViewRepository.createQuery().eq('id', root.id));
    if (
      !revalidated ||
      !revalidated.deletedAt ||
      revalidated.deletedRootId !== revalidated.id ||
      !isPastGracePeriod(revalidated.deletedAt, graceThreshold)
    ) {
      continue;
    }

    await permanentlyDeleteByDeletedRootId(revalidated.id, revalidated.userId, revalidated.workspaceId);
    purgedCount += 1;
    console.log(`Purged data-view ${revalidated.id} (${revalidated.name})`);
  }

  console.log(`✅  Purge complete. ${purgedCount} deleted root item(s) permanently deleted.`);
}

await purgeDeletedPages();
