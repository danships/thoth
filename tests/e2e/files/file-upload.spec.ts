import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// A minimal valid 1x1 transparent PNG, used to drive a real image upload through the block
// editor's UI (as opposed to the API-only requests above, which bypass the browser's
// `fetch`/axios layer and would not have caught THOTH-040's Content-Type regression).
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

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

test('oversized upload is rejected with HTTP 413 Payload Too Large', async ({ page }) => {
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

test('uploading an image through the block editor succeeds', async ({ page }) => {
  // Uses a page dedicated to this spec (created fresh here) rather than a shared seeded page,
  // so this upload doesn't interfere with other specs' assumptions about seeded page content.
  const createResponse = await page.request.post('/api/v1/pages', {
    data: { name: 'E2E Image Upload Page', emoji: '🖼️', parentId: SEED.pages.root.id },
  });
  expect(createResponse.ok()).toBe(true);
  const { data: createdPage } = await createResponse.json();

  await page.goto(`/${SEED.workspace.slug}/pages/${createdPage.id}`);
  await page.getByRole('tab', { name: 'Contents' }).click();

  const editable = page.locator('.bn-editor[contenteditable="true"]');
  await expect(editable).toBeVisible({ timeout: 10_000 });
  await editable.click();

  // Open the slash menu and insert an Image block.
  await page.keyboard.type('/image');
  await page.getByText('Image', { exact: true }).click();

  // The empty image block renders an "Add file" affordance that opens the upload panel.
  const addFileButton = page.locator('.bn-add-file-button');
  await expect(addFileButton).toBeVisible({ timeout: 10_000 });
  await addFileButton.click();

  // The visible `[data-test="upload-input"]` element is a styled button (Mantine's `FileInput`
  // wraps a real `<input type="file">` as a hidden sibling that the button's click delegates
  // to) — target that actual input directly for `setInputFiles`.
  const uploadButton = page.locator('[data-test="upload-input"]');
  await expect(uploadButton).toBeVisible({ timeout: 10_000 });
  const uploadInput = page.locator('.bn-panel input[type="file"]');

  // This is the request that regresses when the client sends `Content-Type: application/json`
  // instead of a proper multipart boundary (THOTH-040 feedback) — asserting on it here is what
  // would have caught that bug, since the earlier API-only tests in this file post multipart
  // requests directly and never exercise the browser's actual upload code path.
  const [uploadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/files') && response.ok()
    ),
    uploadInput.setInputFiles({ name: 'e2e-editor-upload.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG }),
  ]);
  expect(uploadResponse.ok()).toBe(true);
  const uploadBody = await uploadResponse.json();
  expect(uploadBody.data.filename).toBe('e2e-editor-upload.png');

  await expect(page.locator(`img[src="${uploadBody.data.url}"]`)).toBeVisible({ timeout: 10_000 });
});
