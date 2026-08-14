export type EnsureVapidKeysResult =
  { skipped: true } | { publicKey: string; privateKey: string; subject: string; source: 'env' | 'file' | 'generated' };

export function ensureVapidKeys(input: {
  enabled: boolean;
  dir: string;
  environment: NodeJS.ProcessEnv;
}): Promise<EnsureVapidKeysResult>;

export function ensureAndInjectVapidKeys(input: { repositoryRoot: string }): Promise<EnsureVapidKeysResult>;

export function resolveVapidDirectory(repositoryRoot: string, override: string | undefined): string;
export function resolveVapidSubject(environment: NodeJS.ProcessEnv): string;

export const VAPID_FILE_NAME: string;
export const VAPID_PUBLIC_FILE_NAME: string;
