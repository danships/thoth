import { describe, test, expect } from 'vitest';
import * as entities from '../../entities/index.js';
import { WORKSPACE_CASCADE_ENTITY_NAMES } from './workspace-cascade.js';

/**
 * Every entity whose schema embeds `withWorkspaceIdSchema` (a `workspaceId` field) is,
 * unambiguously, workspace-scoped content that must be cascade-deleted by a workspace purge.
 * This list is derived independently from `packages/database/src/schemas/entities/*.ts` (rather
 * than importing `WORKSPACE_CASCADE_ENTITY_NAMES` itself) specifically so this test fails the
 * moment a new workspace-scoped entity is registered without also updating the cascade —
 * exactly the guard THOTH-063 requires. Entities scoped indirectly (via a parent `App`'s or
 * `WorkspaceMember`'s id rather than their own `workspaceId` field) are listed separately below,
 * since they can't be detected by this mechanical check, and are still asserted against the
 * cascade explicitly.
 */
const DIRECTLY_WORKSPACE_SCOPED_ENTITY_NAMES: readonly string[] = [
  entities.CONTAINER_NAME,
  entities.DATA_VIEW_NAME,
  entities.WORKSPACE_MEMBER_NAME,
  entities.WORKSPACE_SLUG_REDIRECT_NAME,
  entities.CONTAINER_ACCESS_NAME,
  entities.APP_NAME,
  entities.WEBHOOK_NAME,
  entities.FILE_USAGE_NAME,
  entities.UPLOADED_FILE_NAME,
  entities.PAGE_REVISION_NAME,
];

// Entities scoped *indirectly* — via a parent App/WorkspaceMember id the cascade itself
// resolves — rather than carrying their own `workspaceId` field.
const INDIRECTLY_WORKSPACE_SCOPED_ENTITY_NAMES: readonly string[] = [
  entities.API_KEY_NAME, // via App.workspaceId (App.id == apiKey.appId)
  entities.WEBHOOK_DELIVERY_NAME, // via App.workspaceId (App.id == webhookDelivery.appId)
  entities.APP_SCOPED_CONTAINER_NAME, // via App.workspaceId (App.id == appScopedContainer.appId)
  entities.MEMBER_SCOPED_CONTAINER_NAME, // via WorkspaceMember.workspaceId
];

// Entities deliberately NOT workspace-scoped (per-user/global state or the Workspace row
// itself) — never expected to appear in the cascade's dependent-entity steps.
const NOT_WORKSPACE_SCOPED_ENTITY_NAMES: readonly string[] = [entities.WORKSPACE_NAME, entities.SETTING_NAME, entities.PLATFORM_USER_NAME];

describe('workspace-cascade entity inventory', () => {
  test('every registered entity is accounted for exactly once (workspace-cascade completeness)', () => {
    const allEntityNames = Object.values(entities)
      .filter((value): value is import('supersave').EntityDefinition => typeof value === 'object' && value !== null)
      .map((entity) => entity.name);
    const accountedFor = new Set([
      ...DIRECTLY_WORKSPACE_SCOPED_ENTITY_NAMES,
      ...INDIRECTLY_WORKSPACE_SCOPED_ENTITY_NAMES,
      ...NOT_WORKSPACE_SCOPED_ENTITY_NAMES,
    ]);

    const unaccountedFor = allEntityNames.filter((name) => !accountedFor.has(name));
    expect(
      unaccountedFor,
      `Entity/entities [${unaccountedFor.join(', ')}] are registered in entities/index.js but not classified ` +
        'in this test as workspace-scoped or not. Classify the new entity above, and if it is ' +
        'workspace-scoped, add its cascade-deletion step to workspace-cascade.ts.'
    ).toEqual([]);
  });

  test('every workspace-scoped entity (direct or indirect) has a cascade step', () => {
    const expected = [...DIRECTLY_WORKSPACE_SCOPED_ENTITY_NAMES, ...INDIRECTLY_WORKSPACE_SCOPED_ENTITY_NAMES];
    for (const name of expected) {
      expect(WORKSPACE_CASCADE_ENTITY_NAMES, `Missing cascade step for workspace-scoped entity "${name}"`).toContain(
        name
      );
    }
  });

  test('non-workspace-scoped entities are not spuriously in the cascade\'s dependent steps', () => {
    // `Workspace` itself is expected — it's deleted last as the final cascade step.
    for (const name of NOT_WORKSPACE_SCOPED_ENTITY_NAMES.filter((entityName) => entityName !== entities.WORKSPACE_NAME)) {
      expect(WORKSPACE_CASCADE_ENTITY_NAMES).not.toContain(name);
    }
    expect(WORKSPACE_CASCADE_ENTITY_NAMES).toContain(entities.WORKSPACE_NAME);
  });

  test('the workspace row is deleted last', () => {
    expect(WORKSPACE_CASCADE_ENTITY_NAMES.at(-1)).toBe(entities.WORKSPACE_NAME);
  });
});
