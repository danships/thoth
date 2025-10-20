import type { Container, Workspace } from "@thoth/types/database";
import { type BaseEntity, SuperSave } from "supersave";
import { environment } from "../../core/environment.js";
import * as entities from "./entities/index.js";

export const db: SuperSave = await SuperSave.create(environment.DB);
let initialized = false;

export async function initialize() {
	if (initialized) {
		throw new Error("Database already initialized.");
	}

	initialized = true;
	await db.addEntity(entities.Container);
	await db.addEntity(entities.Workspace);
}

function getRepository<T extends BaseEntity>(name: string) {
	return db.getRepository<T>(name);
}

export function getContainerRepository() {
	return getRepository<Container>(entities.CONTAINER_NAME);
}

export function getWorkspaceRepository() {
	return getRepository<Workspace>(entities.WORKSPACE_NAME);
}
