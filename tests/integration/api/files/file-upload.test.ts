import { describe, expect, test } from 'vitest';
import { getBaseUrl, getOwnerClient, SEED } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function uploadFile(filename: string, mimeType: string, contents: Buffer | Uint8Array): Promise<Response> {
  const client = await getOwner();
  const form = new FormData();
  const fileBlob = new globalThis.Blob([new Uint8Array(contents)], { type: mimeType });
  form.set('file', fileBlob, filename);
  return client.fetch('/api/v1/files', {
    method: 'POST',
    body: form,
  });
}

describe('file upload API', () => {
  test('serves the seeded uploaded file bytes to the owner', async () => {
    const client = await getOwner();

    const response = await client.get(`/api/v1/files/${SEED.file.id}/content`);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe(SEED.file.content);
  });

  test('upload happy path: a small text file is accepted and served back', async () => {
    const client = await getOwner();
    const buffer = Buffer.from('Freshly uploaded e2e content');
    const response = await uploadFile('e2e-upload-happy-path.txt', 'text/plain', buffer);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { data: { filename: string; url: string } };
    expect(body.data.filename).toBe('e2e-upload-happy-path.txt');
    expect(body.data.url).toMatch(/\/api\/v1\/files\/.+\/content/);

    const served = await client.get(body.data.url);
    expect(served.ok).toBe(true);
    expect(await served.text()).toBe(buffer.toString('utf8'));
  });

  test('oversized upload is rejected with HTTP 413 Payload Too Large', async () => {
    const oversized = Buffer.alloc(11 * 1024 * 1024, 'a');
    const response = await uploadFile('too-big.bin', 'application/octet-stream', oversized);
    expect(response.status).toBe(413);
  });

  test('dangerous file types are rejected at upload', async () => {
    const response = await uploadFile(
      'malware.exe',
      'application/x-msdownload',
      Buffer.from('not really an executable')
    );
    expect(response.status).toBe(415);
  });
});
