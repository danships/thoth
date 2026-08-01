import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('serves the seeded uploaded file bytes to the owner', async ({ page }) => {
  const response = await page.request.get(`/api/v1/files/${SEED.file.id}/content`);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe(SEED.file.content);
});

test('upload happy path: a small text file is accepted and served back', async ({ page }) => {
  const buffer = Buffer.from('Freshly uploaded e2e content');
  const response = await page.request.post('/api/v1/files', {
    multipart: {
      file: {
        name: 'e2e-upload-happy-path.txt',
        mimeType: 'text/plain',
        buffer,
      },
    },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.data.filename).toBe('e2e-upload-happy-path.txt');
  expect(body.data.url).toMatch(/\/api\/v1\/files\/.+\/content/);

  const served = await page.request.get(body.data.url);
  expect(served.ok()).toBe(true);
  expect(await served.text()).toBe(buffer.toString('utf8'));
});

test('oversized upload is rejected with a validation error', async ({ page }) => {
  // 11 MB, larger than the 10 MB per-file cap — no notification/UI round trip needed here,
  // the manual upload handler must reject it before any bytes are written.
  const oversized = Buffer.alloc(11 * 1024 * 1024, 'a');
  const response = await page.request.post('/api/v1/files', {
    multipart: {
      file: {
        name: 'too-big.bin',
        mimeType: 'application/octet-stream',
        buffer: oversized,
      },
    },
  });
  expect(response.status()).toBe(413);
});

test('dangerous file types are rejected at upload', async ({ page }) => {
  const response = await page.request.post('/api/v1/files', {
    multipart: {
      file: {
        name: 'malware.exe',
        mimeType: 'application/x-msdownload',
        buffer: Buffer.from('not really an executable'),
      },
    },
  });
  expect(response.status()).toBe(415);
});
