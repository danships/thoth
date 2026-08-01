// Curated, deny-by-default list of dangerous file types (THOTH-040). Rejected outright at
// upload (`415`); anything that somehow ends up stored anyway is still never served inline (see
// `src/app/api/v1/files/[id]/content/route.ts`) and the client warns before opening it. Kept
// import-free of any server-only module so it can be shared verbatim between server routes and
// the browser (see `src/lib/files/dangerous.ts`, which re-exports this module for client use).
//
// Extensions are matched case-insensitively against the trailing segment of the uploaded
// filename. MIME types are matched case-insensitively against the browser-provided `File.type`.
// This is a critical security boundary — err on the side of adding more entries rather than
// fewer; a false positive only costs a user re-naming a legitimate file, a false negative could
// let dangerous, directly-executable content be uploaded and later opened by another user.
export const DANGEROUS_EXTENSIONS: readonly string[] = [
  // Windows executables/installers/scripts
  'exe',
  'msi',
  'msp',
  'bat',
  'cmd',
  'com',
  'scr',
  'pif',
  'gadget',
  'application',
  'hta',
  'cpl',
  'msc',
  'vb',
  'vbs',
  'vbe',
  'ws',
  'wsf',
  'wsc',
  'wsh',
  'ps1',
  'ps1xml',
  'ps2',
  'ps2xml',
  'psc1',
  'psc2',
  'psd1',
  'psm1',
  'reg',
  // Unix/macOS executables and scripts
  'sh',
  'bash',
  'zsh',
  'run',
  'command',
  'app',
  'action',
  'workflow',
  // JVM / .NET / other interpreted-and-executed bytecode
  'jar',
  'jnlp',
  'msix',
  'appx',
  // Browser-executable / markup-injection vectors
  'html',
  'htm',
  'svg',
  'xhtml',
  'shtml',
  'js',
  'mjs',
  'jse',
  // Office macro-enabled documents
  'docm',
  'dotm',
  'xlsm',
  'xltm',
  'xlam',
  'pptm',
  'potm',
  'ppam',
  'ppsm',
  'sldm',
  // Shortcuts / links that can point at arbitrary executables
  'lnk',
  'url',
  'desktop',
  'inf',
];

export const DANGEROUS_MIME_TYPES: readonly string[] = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-msi',
  'application/x-ms-shortcut',
  'application/x-sh',
  'application/x-bat',
  'application/bat',
  'application/x-executable',
  'application/x-elf',
  'application/x-mach-binary',
  'application/vnd.microsoft.portable-executable',
  'application/java-archive',
  'application/x-java-archive',
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
];

/** Content types considered safe enough to serve `Content-Disposition: inline` for the browser
 * to render directly (e.g. embedded in the BlockNote editor). Deliberately excludes SVG (an XSS
 * vector via embedded scripts) — SVGs are always served as an attachment. */
export const SAFE_INLINE_IMAGE_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
];

function extractExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return null;
  }
  return filename.slice(lastDot + 1).toLowerCase();
}

export type DangerousFileCandidate = {
  filename: string;
  mimeType: string;
};

/**
 * Deny-by-default check: a file is considered dangerous if either its extension or its
 * browser-reported MIME type matches the curated lists above. Used both at upload time (server,
 * `415` rejection) and client-side (before opening a served file in a new tab).
 */
export function isDangerousFile({ filename, mimeType }: DangerousFileCandidate): boolean {
  const extension = extractExtension(filename);
  const normalizedMimeType = mimeType.toLowerCase().trim();

  if (extension && DANGEROUS_EXTENSIONS.includes(extension)) {
    return true;
  }

  return DANGEROUS_MIME_TYPES.includes(normalizedMimeType);
}

export function getFileExtension(filename: string): string | null {
  return extractExtension(filename);
}
