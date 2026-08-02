import type { SuperSave } from 'supersave';
import * as entities from '../entities';
import type { DataView } from '@/types/database';

/**
 * Backfills the new `filters`/`sorts` arrays (THOTH-037) onto pre-existing `DataView` rows.
 * Purely additive/backward-compatible: the Zod schema's `.default([])` already fills these in
 * on read, so this migration only exists so raw-SQL introspection/tools that expect the keys to
 * exist don't have to special-case `undefined`. Mirrors `soft-delete-backfill.ts`.
 */
export async function backfillDataViewFiltersSorts(superSave: SuperSave): Promise<void> {
  const dataViewRepository = superSave.getRepository<DataView>(entities.DATA_VIEW_NAME);

  const dataViews = await dataViewRepository.getByQuery(dataViewRepository.createQuery());
  for (const dataView of dataViews) {
    let needsUpdate = false;
    const updated: DataView = { ...dataView };

    if (updated.filters === undefined) {
      updated.filters = [];
      needsUpdate = true;
    }

    if (updated.sorts === undefined) {
      updated.sorts = [];
      needsUpdate = true;
    }

    if (needsUpdate) {
      await dataViewRepository.update(updated);
    }
  }
}
