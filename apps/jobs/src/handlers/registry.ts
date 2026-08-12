import type { JobDefinition } from '@thoth/job-protocol';

/**
 * In-process registry of internal job definitions (THOTH-059). Only modules inside `@thoth/jobs`
 * register handlers here; the registry itself is never exposed on the IPC boundary. Production
 * job types (webhooks, purge, history, ...) are added in later tickets — for THOTH-059 only the
 * test-only no-op handler and code-owned interval-scheduling probes are wired.
 */
export class JobRegistry {
  private readonly definitions = new Map<string, JobDefinition<unknown>>();

  public register<T>(definition: JobDefinition<T>): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Job type already registered: ${definition.type}`);
    }
    this.definitions.set(definition.type, definition as JobDefinition<unknown>);
  }

  public get(type: string): JobDefinition<unknown> | undefined {
    return this.definitions.get(type);
  }
}
