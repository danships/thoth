import assert from 'node:assert/strict';
import { getFileExtension, isDangerousFile } from './constants';

// Dangerous by extension
assert.equal(isDangerousFile({ filename: 'setup.exe', mimeType: 'application/octet-stream' }), true);
assert.equal(isDangerousFile({ filename: 'script.sh', mimeType: 'text/plain' }), true);
assert.equal(isDangerousFile({ filename: 'page.html', mimeType: 'text/plain' }), true);
assert.equal(isDangerousFile({ filename: 'logo.svg', mimeType: 'image/svg+xml' }), true);
assert.equal(isDangerousFile({ filename: 'macro.docm', mimeType: 'application/octet-stream' }), true);

// Dangerous by MIME type even with a benign-looking extension
assert.equal(isDangerousFile({ filename: 'notes.txt', mimeType: 'application/x-msdownload' }), true);

// Safe files
assert.equal(isDangerousFile({ filename: 'photo.png', mimeType: 'image/png' }), false);
assert.equal(isDangerousFile({ filename: 'document.pdf', mimeType: 'application/pdf' }), false);
assert.equal(isDangerousFile({ filename: 'notes.txt', mimeType: 'text/plain' }), false);

// Case-insensitivity
assert.equal(isDangerousFile({ filename: 'SETUP.EXE', mimeType: 'application/octet-stream' }), true);
assert.equal(isDangerousFile({ filename: 'notes.txt', mimeType: 'APPLICATION/X-MSDOWNLOAD' }), true);

// Extensionless files are judged purely on MIME type
assert.equal(isDangerousFile({ filename: 'README', mimeType: 'text/plain' }), false);
assert.equal(isDangerousFile({ filename: 'README', mimeType: 'text/html' }), true);

// getFileExtension
assert.equal(getFileExtension('archive.tar.gz'), 'gz');
assert.equal(getFileExtension('README'), null);
assert.equal(getFileExtension('trailing.'), null);

console.log('✅  isDangerousFile tests passed');
