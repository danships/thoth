import type { SuperSave } from 'supersave';
import * as entities from '../entities';
import type { Container, DataView } from '../types';

export async function backfillSoftDeleteFields(superSave: SuperSave): Promise<void> {
  const containerRepository = superSave.getRepository<Container>(entities.CONTAINER_NAME);
  const dataViewRepository = superSave.getRepository<DataView>(entities.DATA_VIEW_NAME);

  const containers = await containerRepository.getByQuery(containerRepository.createQuery());
  for (const container of containers) {
    let needsUpdate = false;
    const updated: Container = { ...container };

    if (updated.deletedAt === undefined) {
      updated.deletedAt = null;
      needsUpdate = true;
    }

    if (updated.deletedRootId === undefined) {
      updated.deletedRootId = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await containerRepository.update(updated);
    }
  }

  const dataViews = await dataViewRepository.getByQuery(dataViewRepository.createQuery());
  for (const dataView of dataViews) {
    let needsUpdate = false;
    const updated: DataView = { ...dataView };

    if (updated.deletedAt === undefined) {
      updated.deletedAt = null;
      needsUpdate = true;
    }

    if (updated.deletedRootId === undefined) {
      updated.deletedRootId = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await dataViewRepository.update(updated);
    }
  }
}
