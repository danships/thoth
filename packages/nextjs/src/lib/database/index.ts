import { SuperSave } from 'supersave';
import type { Container, Workspace } from '@/types/database';
import { environment } from '../environment';
import * as entities from './entities';

let database: SuperSave;

export async function getDatabase() {
  if (database) {
    return database;
  }

  database = await SuperSave.create(environment.DB);

  await database.addEntity(entities.Container);
  await database.addEntity(entities.Workspace);
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
