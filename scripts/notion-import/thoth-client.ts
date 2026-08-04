// Thin HTTP client for Thoth's public `/api/v1/*` API. Talks over plain `fetch` (no axios, no
// Thoth source imports) so this script has zero coupling to the Thoth codebase — only to its
// documented, stable HTTP surface. All shapes below intentionally duplicate (not import) the Zod
// schemas from `src/types/api/endpoints/*` at the time of writing.

export type SelectColor =
  'blue' | 'cyan' | 'teal' | 'green' | 'lime' | 'yellow' | 'orange' | 'red' | 'pink' | 'grape' | 'gray';

export type PrimitiveColumnInput =
  { name: string; type: 'string' } | { name: string; type: 'number' } | { name: string; type: 'boolean' };

export type ExtendedColumnInput =
  | PrimitiveColumnInput
  | { name: string; type: 'date'; mode: 'date' | 'time' | 'datetime'; displayFormat: string }
  | { name: string; type: 'single-select'; options: { label: string; color: SelectColor }[] }
  | { name: string; type: 'multi-select'; options: { label: string; color: SelectColor }[] };

export type ThothColumn = {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'single-select' | 'multi-select';
  mode?: 'date' | 'time' | 'datetime';
  displayFormat?: string;
  options?: { id: string; label: string; color: string }[];
};

export type ThothPageValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string | null }
  | { type: 'single-select'; value: string | null }
  | { type: 'multi-select'; value: string[] };

export class ThothApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
  }
}

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
};

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 500,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class ThothClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly retryOptions: RetryOptions = DEFAULT_RETRY
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let attempt = 0;
    // Redact the key from any thrown error to keep secrets out of logs, per THOTH-049 security
    // requirements — even though we control the message, never interpolate the raw key.
    for (;;) {
      attempt += 1;
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= this.retryOptions.maxAttempts) {
          throw new ThothApiError(
            `Thoth API ${path} failed with status ${response.status} after ${attempt} attempts`,
            response.status
          );
        }
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number.parseFloat(retryAfterHeader) * 1000 : undefined;
        const delay =
          retryAfterMs && Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : this.retryOptions.baseDelayMs * 2 ** (attempt - 1);
        await this.retryOptions.sleep(delay);
        continue;
      }

      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }
        throw new ThothApiError(`Thoth API ${path} failed with status ${response.status}`, response.status, body);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const json = (await response.json()) as { data?: T } & Partial<T>;
      return (json && typeof json === 'object' && 'data' in json ? (json as { data: T }).data : (json as T)) as T;
    }
  }

  // Validates the API key and workspace access. Used at bootstrap only.
  async validateConnection(): Promise<void> {
    await this.request(`/workspaces`);
  }

  async createPage(input: {
    name: string;
    emoji?: string | null | undefined;
    parentId?: string | null | undefined;
    workspaceId?: string | undefined;
  }) {
    return this.request<{ id: string; name: string }>('/pages', { method: 'POST', body: JSON.stringify(input) });
  }

  async getPageContent(pageId: string): Promise<string> {
    const result = await this.request<{ content: string }>(`/pages/${pageId}/content`);
    return result.content;
  }

  async setPageContent(pageId: string, content: string): Promise<void> {
    await this.request(`/pages/${pageId}/content`, { method: 'POST', body: JSON.stringify({ content }) });
  }

  async getPageValues(pageId: string): Promise<Record<string, ThothPageValue>> {
    const result = await this.request<{ values?: Record<string, ThothPageValue> }>(
      `/pages/${pageId}?includeValues=true`
    );
    return result.values ?? {};
  }

  async updatePageValues(pageId: string, values: Record<string, ThothPageValue>): Promise<void> {
    await this.request(`/pages/${pageId}/values`, { method: 'PATCH', body: JSON.stringify(values) });
  }

  async createDataSource(input: {
    name: string;
    columns?: PrimitiveColumnInput[] | undefined;
    workspaceId?: string | undefined;
  }) {
    return this.request<{ id: string; columns: ThothColumn[] }>('/data-sources', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async addDataSourceColumn(dataSourceId: string, input: ExtendedColumnInput): Promise<ThothColumn> {
    return this.request<ThothColumn>(`/data-sources/${dataSourceId}/columns`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async uploadFile(input: {
    filename: string;
    mimeType: string;
    data: Buffer;
    pageId?: string | undefined;
    workspaceId?: string | undefined;
  }) {
    const formData = new FormData();
    formData.set('file', new Blob([new Uint8Array(input.data)], { type: input.mimeType }), input.filename);
    if (input.pageId) {
      formData.set('pageId', input.pageId);
    } else if (input.workspaceId) {
      formData.set('workspaceId', input.workspaceId);
    }

    const url = `${this.baseUrl}/files`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });
    if (!response.ok) {
      throw new ThothApiError(`Thoth API /files failed with status ${response.status}`, response.status);
    }
    const json = (await response.json()) as { data: { id: string; url: string; filename: string } };
    return json.data;
  }
}
