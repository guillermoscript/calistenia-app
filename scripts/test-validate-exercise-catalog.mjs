#!/usr/bin/env node
/**
 * test-validate-exercise-catalog.mjs
 *
 * Integration + unit tests for validate-exercise-catalog.mjs.
 * Runs with plain Node.js — no test framework required.
 *
 * Tests:
 *   (a) Bundled catalog (packages/core/data/exercise-catalog.json) → 0 hard errors.
 *   (b) Each seed file (seeds/exercises/*.json) → 0 hard errors.
 *   (c) Synthetic catalog with a duplicate id → hard error detected (validator is not a no-op).
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 */

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repository root = one level up from scripts/
const REPO_ROOT = resolve(__dirname, '..');
const VALIDATOR = resolve(REPO_ROOT, 'scripts/validate-exercise-catalog.mjs');
const BUNDLED_CATALOG = resolve(REPO_ROOT, 'packages/core/data/exercise-catalog.json');
const SEEDS_DIR = resolve(REPO_ROOT, 'seeds/exercises');

let passed = 0;
let failed = 0;

/** Run the validator against a file, return { exitCode, stdout, stderr }. */
function runValidator(filePath) {
  const result = spawnSync('node', [VALIDATOR, filePath], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Assert with a message. */
function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS  ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL  ${msg}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────
// (a) Bundled catalog must pass with 0 hard errors
// ──────────────────────────────────────────────────────────────
console.log('\n[a] Bundled catalog — packages/core/data/exercise-catalog.json');
{
  const { exitCode, stdout } = runValidator(BUNDLED_CATALOG);
  assert(exitCode === 0, `Exits 0 (got ${exitCode})\n      stdout: ${stdout.trim()}`);
  assert(stdout.includes('0 errors'), `Reports "0 errors" (got: ${stdout.trim()})`);
}

// ──────────────────────────────────────────────────────────────
// (b) Each seed file must pass with 0 hard errors
// ──────────────────────────────────────────────────────────────
import { readdirSync } from 'fs';
const seedFiles = readdirSync(SEEDS_DIR)
  .filter(f => f.endsWith('.json') && f !== '_schema.json')
  .map(f => join(SEEDS_DIR, f));

console.log(`\n[b] Seed files — ${seedFiles.length} files`);
for (const seedFile of seedFiles) {
  const label = seedFile.replace(REPO_ROOT + '/', '');
  const { exitCode, stdout } = runValidator(seedFile);
  assert(exitCode === 0, `${label}: exits 0`);
  assert(stdout.includes('0 errors'), `${label}: reports "0 errors" (got: ${stdout.trim()})`);
}

// ──────────────────────────────────────────────────────────────
// (c) Synthetic catalog with duplicate id → validator must detect it
// ──────────────────────────────────────────────────────────────
console.log('\n[c] Synthetic duplicate-id catalog — validator must hard-fail');
{
  const syntheticCatalog = {
    generated_at: '2026-01-01T00:00:00Z',
    total_count: 2,
    categories: {
      test_category: {
        exercises: [
          {
            id: 'dup_exercise',
            name: { es: 'Ejercicio A', en: 'Exercise A' },
            muscles: { es: 'Core', en: 'Core' },
            difficulty: 'beginner',
            equipment: [],
            category: 'test_category',
            source: 'test',
          },
          {
            id: 'dup_exercise', // intentional duplicate id — same as above
            name: { es: 'Ejercicio B', en: 'Exercise B' },
            muscles: { es: 'Espalda', en: 'Back' },
            difficulty: 'intermediate',
            equipment: [],
            category: 'test_category',
            source: 'test',
          },
        ],
      },
    },
  };

  const tmpFile = join(tmpdir(), `validate-test-dup-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(syntheticCatalog, null, 2), 'utf8');

  try {
    const { exitCode, stdout } = runValidator(tmpFile);
    assert(exitCode !== 0, `Exits non-zero on duplicate id (got ${exitCode})`);
    assert(
      stdout.includes('Duplicate id') || stdout.includes('duplicate'),
      `Reports duplicate id in output (got: ${stdout.trim()})`
    );
  } finally {
    unlinkSync(tmpFile);
  }
}

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${failed === 0 ? 'OK' : 'FAIL'}: ${passed}/${total} assertions passed`);
if (failed > 0) {
  process.exit(1);
}
