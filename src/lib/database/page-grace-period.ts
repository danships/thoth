import { getEnvironment } from '../environment';

export const DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS = 30;

export async function getPageDeleteGracePeriodDays(): Promise<number> {
  const environment = await getEnvironment();
  const parsed = Number.parseInt(environment.PAGE_DELETE_GRACE_PERIOD_DAYS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS;
}
