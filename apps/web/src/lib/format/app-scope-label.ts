import type { AppScopeType } from '@thoth/database/types';

// User-facing labels for an App's `scopeType` — kept in one place so the wording used across
// the Apps table/detail modal and the page-detail "Apps" menu always stays in sync.
const APP_SCOPE_LABELS: Record<AppScopeType, string> = {
  workspace: 'Entire workspace',
  containers: 'Specific pages/data sources',
  containers_with_children: 'Specific pages/data sources + descendants',
};

export function getAppScopeLabel(scopeType: AppScopeType): string {
  return APP_SCOPE_LABELS[scopeType];
}
