import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { getFileExtension, isDangerousFile } from './constants';

describe('file constants', () => {
  beforeAll(() => undefined);
  afterAll(() => undefined);

  test('flags dangerous files by extension', () => {
    expect(isDangerousFile({ filename: 'setup.exe', mimeType: 'application/octet-stream' })).toBe(true);
    expect(isDangerousFile({ filename: 'script.sh', mimeType: 'text/plain' })).toBe(true);
    expect(isDangerousFile({ filename: 'page.html', mimeType: 'text/plain' })).toBe(true);
    expect(isDangerousFile({ filename: 'logo.svg', mimeType: 'image/svg+xml' })).toBe(true);
    expect(isDangerousFile({ filename: 'macro.docm', mimeType: 'application/octet-stream' })).toBe(true);
  });

  test('flags dangerous files by MIME type even with a benign-looking extension', () => {
    expect(isDangerousFile({ filename: 'notes.txt', mimeType: 'application/x-msdownload' })).toBe(true);
  });

  test('allows safe files', () => {
    expect(isDangerousFile({ filename: 'photo.png', mimeType: 'image/png' })).toBe(false);
    expect(isDangerousFile({ filename: 'document.pdf', mimeType: 'application/pdf' })).toBe(false);
    expect(isDangerousFile({ filename: 'notes.txt', mimeType: 'text/plain' })).toBe(false);
  });

  test('checks files case-insensitively', () => {
    expect(isDangerousFile({ filename: 'SETUP.EXE', mimeType: 'application/octet-stream' })).toBe(true);
    expect(isDangerousFile({ filename: 'notes.txt', mimeType: 'APPLICATION/X-MSDOWNLOAD' })).toBe(true);
  });

  test('judges extensionless files by MIME type only', () => {
    expect(isDangerousFile({ filename: 'README', mimeType: 'text/plain' })).toBe(false);
    expect(isDangerousFile({ filename: 'README', mimeType: 'text/html' })).toBe(true);
  });

  test('extracts file extensions', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
    expect(getFileExtension('README')).toBeNull();
    expect(getFileExtension('trailing.')).toBeNull();
  });
});
