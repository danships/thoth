import type { SuperSave } from 'supersave';
import * as entities from '../entities/index.js';
import type { Container } from '../types.js';

// THOTH-077: additive, non-destructive backfill seeding `isPrivate`/`privateRootId` on
// pre-existing `Container` rows, mirroring `backfillSoftDeleteFields`'s `deletedAt`/
// `deletedRootId` pattern exactly — every existing page/data-source defaults to public
// (`isPrivate: false, privateRootId: null`).
export async function backfillIsPrivateFields(superSave: SuperSave): Promise<void> {
  const containerRepository = superSave.getRepository<Container>(entities.CONTAINER_NAME);

  const containers = await containerRepository.getByQuery(containerRepository.createQuery());
  for (const container of containers) {
    let needsUpdate = false;
    const updated: Container = { ...container };

    if (updated.isPrivate === undefined) {
      updated.isPrivate = false;
      needsUpdate = true;
    }

    if (updated.privateRootId === undefined) {
      updated.privateRootId = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await containerRepository.update(updated);
    }
  }
}
