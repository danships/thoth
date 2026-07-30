import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '../src/lib/openapi/build';

const outputPath = path.resolve(process.cwd(), 'public/openapi.json');
const checkMode = process.argv.includes('--check');
const document = buildOpenApiDocument();
const nextContents = `${JSON.stringify(document, null, 2)}\n`;

mkdirSync(path.resolve(process.cwd(), 'public'), { recursive: true });

if (checkMode) {
  const currentContents = safeRead(outputPath);
  if (currentContents !== nextContents) {
    console.error('public/openapi.json is out of date. Run `pnpm openapi:generate`.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, nextContents);
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
