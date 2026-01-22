import { SuperSave } from 'supersave';
import type { Container, Workspace, DataView } from '@/types/database';
import { getEnvironment } from '../environment';
import * as entities from './entities';
import { migrations } from './migrations';

let database: SuperSave;

export async function getDatabase() {
  if (database) {
    return database;
  }

  const environment = await getEnvironment();
  const skipSync = environment.SUPERSAVE_SKIP_SYNC;

  database = await SuperSave.create(environment.DB, {
    migrations,
    skipSync,
  });

  await database.addEntity(entities.Container);
  await database.addEntity(entities.Workspace);
  await database.addEntity(entities.DataView);

  if (!skipSync) {
    await database.runMigrations();
  }

  return database;
}

export async function getContainerRepository() {
  const database = await getDatabase();
  return database.getRepository<Container>(entities.CONTAINER_NAME);
}

export async function getWorkspaceRepository() {
  const database = await getDatabase();
  return database.getRepository<Workspace>(entities.WORKSPACE_NAME);
}

export async function getDataViewRepository() {
  const database = await getDatabase();
  return database.getRepository<DataView>(entities.DATA_VIEW_NAME);
}
