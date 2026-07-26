// scripts/purge-deleted-workspaces.ts
//
// Hard-deletes workspaces (and all their Container/DataView/WorkspaceMember/
// WorkspaceSlugRedirect rows) whose soft-delete grace period has expired. Intended to be
// invoked by an external daily cron / scheduled task outside the app process — no in-app job
// scheduler is introduced for this ticket. Run via `pnpm workspaces:purge`.
import 'dotenv/config';
import {
  getContainerRepository,
  getDataViewRepository,
  getDatabase,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
  getWorkspaceSlugRedirectRepository,
} from '../src/lib/database/index.js';

const DEFAULT_GRACE_PERIOD_DAYS = 30;
const RACE_SAFETY_MARGIN_MS = 60 * 60 * 1000; // 1 hour

function getGracePeriodDays(): number {
  const raw = process.env['WORKSPACE_DELETE_GRACE_PERIOD_DAYS'];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_PERIOD_DAYS;
}

async function purgeDeletedWorkspaces() {
  await getDatabase();

  const gracePeriodDays = getGracePeriodDays();
  const graceThreshold = Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000;

  const workspaceRepository = await getWorkspaceRepository();
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const workspaceSlugRedirectRepository = await getWorkspaceSlugRedirectRepository();

  const workspaces = await workspaceRepository.getByQuery(workspaceRepository.createQuery());

  let purgedCount = 0;

  for (const workspace of workspaces) {
    if (!workspace.deletedAt) {
      continue;
    }

    const deletedAtMs = Date.parse(workspace.deletedAt);
    if (Number.isNaN(deletedAtMs) || deletedAtMs > graceThreshold) {
      continue;
    }

    // Race-safety margin: skip anything touched in the last hour, in case a restore is
    // in-flight concurrently with this purge run.
    const lastUpdatedMs = Date.parse(workspace.lastUpdated);
    if (!Number.isNaN(lastUpdatedMs) && lastUpdatedMs > Date.now() - RACE_SAFETY_MARGIN_MS) {
      continue;
    }

    const containers = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('workspaceId', workspace.id)
    );
    for (const container of containers) {
      await containerRepository.deleteUsingId(container.id);
    }

    const dataViews = await dataViewRepository.getByQuery(
      dataViewRepository.createQuery().eq('workspaceId', workspace.id)
    );
    for (const dataView of dataViews) {
      await dataViewRepository.deleteUsingId(dataView.id);
    }

    const members = await workspaceMemberRepository.getByQuery(
      workspaceMemberRepository.createQuery().eq('workspaceId', workspace.id)
    );
    for (const member of members) {
      await workspaceMemberRepository.deleteUsingId(member.id);
    }

    const redirects = await workspaceSlugRedirectRepository.getByQuery(
      workspaceSlugRedirectRepository.createQuery().eq('workspaceId', workspace.id)
    );
    for (const redirect of redirects) {
      await workspaceSlugRedirectRepository.deleteUsingId(redirect.id);
    }

    await workspaceRepository.deleteUsingId(workspace.id);
    purgedCount += 1;
    console.log(`Purged workspace ${workspace.id} (${workspace.name})`);
  }

  console.log(`✅  Purge complete. ${purgedCount} workspace(s) permanently deleted.`);
}

await purgeDeletedWorkspaces();
