import type { SuperSave } from 'supersave';
import * as entities from '../entities';
import type { WorkspaceMember, WorkspaceMemberCreate } from '@/types/database';

// role -> permission/scopeType mapping for pre-existing `workspace-member` rows created before
// THOTH-042. Existing members receive workspace scope. Viewers receive `read`; all other roles
// receive `read_write`. This preserves the existing capability model.
function permissionForRole(role: string): 'read' | 'read_write' {
  return role === 'viewer' ? 'read' : 'read_write';
}

/**
 * One-time backfill for `workspace-member` rows created before member-level `permission`/
 * `scopeType` support (THOTH-042): every existing row (owner, editor, viewer, and the synthetic
 * `app` role alike) is backfilled to `scopeType: 'workspace'`, with `permission` derived from
 * `role` (`viewer` -> `read`, everything else -> `read_write`). Runs as a SuperSave `Migration`
 * (not a standalone script), mirroring `workspace-multi-tenancy-backfill`, and must run *after*
 * it since that migration is what creates the owner rows being backfilled here.
 */
export async function backfillMemberAccess(superSave: SuperSave): Promise<void> {
  const workspaceMemberRepository = superSave.getRepository<WorkspaceMemberCreate & { id: string }>(
    entities.WORKSPACE_MEMBER_NAME
  );

  const members: WorkspaceMember[] = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery()
  );

  for (const member of members) {
    if (member.permission && member.scopeType) {
      continue;
    }

    await workspaceMemberRepository.update({
      ...member,
      permission: member.permission ?? permissionForRole(member.role),
      scopeType: member.scopeType ?? 'workspace',
    });
  }
}
