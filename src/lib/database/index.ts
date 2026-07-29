import { SuperSave } from 'supersave';
import type {
  Container,
  ContainerAccess,
  Workspace,
  DataView,
  WorkspaceMember,
  WorkspaceSlugRedirect,
  App,
  ApiKey,
  AppScopedContainer,
} from '@/types/database';
import { getEnvironment } from '../environment';
import * as entities from './entities';
import { migrations } from './migrations';

let databasePromise: Promise<SuperSave> | undefined;

async function initializeDatabase() {
  const environment = await getEnvironment();
  const skipSync = environment.SUPERSAVE_SKIP_SYNC;

  const database = await SuperSave.create(environment.DB, {
    migrations,
    skipSync,
  });

  await database.addEntity(entities.Container);
  await database.addEntity(entities.ContainerAccess);
  await database.addEntity(entities.Workspace);
  await database.addEntity(entities.DataView);
  await database.addEntity(entities.WorkspaceMember);
  await database.addEntity(entities.WorkspaceSlugRedirect);
  await database.addEntity(entities.App);
  await database.addEntity(entities.ApiKey);
  await database.addEntity(entities.AppScopedContainer);

  if (!skipSync) {
    await database.runMigrations();
  }

  return database;
}

export async function getDatabase() {
  // Cache the in-flight initialization promise (not just the resolved value) so
  // concurrent callers await the same initialization instead of each racing to
  // create the database and register entities, which caused duplicate entity
  // registration (UNIQUE constraint failures) and partially-initialized instances.
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error: unknown) => {
      // Allow a subsequent call to retry initialization if it failed.
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}

export async function getContainerRepository() {
  const database = await getDatabase();
  return database.getRepository<Container>(entities.CONTAINER_NAME);
}

export async function getContainerAccessRepository() {
  const database = await getDatabase();
  return database.getRepository<ContainerAccess>(entities.CONTAINER_ACCESS_NAME);
}

export async function getWorkspaceRepository() {
  const database = await getDatabase();
  return database.getRepository<Workspace>(entities.WORKSPACE_NAME);
}

export async function getDataViewRepository() {
  const database = await getDatabase();
  return database.getRepository<DataView>(entities.DATA_VIEW_NAME);
}

export async function getWorkspaceMemberRepository() {
  const database = await getDatabase();
  return database.getRepository<WorkspaceMember>(entities.WORKSPACE_MEMBER_NAME);
}

export async function getWorkspaceSlugRedirectRepository() {
  const database = await getDatabase();
  return database.getRepository<WorkspaceSlugRedirect>(entities.WORKSPACE_SLUG_REDIRECT_NAME);
}

export async function getAppRepository() {
  const database = await getDatabase();
  return database.getRepository<App>(entities.APP_NAME);
}

export async function getApiKeyRepository() {
  const database = await getDatabase();
  return database.getRepository<ApiKey>(entities.API_KEY_NAME);
}

export async function getAppScopedContainerRepository() {
  const database = await getDatabase();
  return database.getRepository<AppScopedContainer>(entities.APP_SCOPED_CONTAINER_NAME);
}
