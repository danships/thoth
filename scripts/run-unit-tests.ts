// scripts/run-unit-tests.ts
//
// Discovers every `*.test.ts` file under `src/` and runs each in its own `tsx` process so a
// failure in one suite doesn't prevent the rest from running. Reports a pass/fail summary and
// exits non-zero if any suite failed. Replaces a manually maintained, hand-chained list of test
// files in the `test:unit` script.
import { spawnSync } from 'node:child_process';
import { glob } from 'node:fs/promises';

async function findTestFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const file of glob('src/**/*.test.ts')) {
    files.push(file);
  }
  return files.toSorted();
}

async function runUnitTests() {
  const testFiles = await findTestFiles();

  if (testFiles.length === 0) {
    console.error('No test files found matching src/**/*.test.ts');
    process.exitCode = 1;
    return;
  }

  const failures: string[] = [];

  for (const testFile of testFiles) {
    console.log(`\n▶ Running ${testFile}`);
    const result = spawnSync('tsx', [testFile], { stdio: 'inherit' });

    if (result.status !== 0) {
      failures.push(testFile);
    }
  }

  console.log('\n─────────────────────────────');
  console.log(`✅  ${testFiles.length - failures.length}/${testFiles.length} test file(s) passed`);

  if (failures.length > 0) {
    console.log(`❌  Failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

await runUnitTests();
