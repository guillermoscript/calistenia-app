#!/usr/bin/env node
/**
 * validate-exercise-catalog.mjs
 *
 * Validates the bundled exercise-catalog.json (packages/core/data/exercise-catalog.json)
 * or individual seed files (seeds/exercises/*.json).
 *
 * Exit codes:
 *   0 — no hard errors (warnings may be present)
 *   1 — one or more hard errors detected
 *
 * Usage:
 *   node scripts/validate-exercise-catalog.mjs <path-to-catalog.json>
 *   node scripts/validate-exercise-catalog.mjs packages/core/data/exercise-catalog.json
 *   node scripts/validate-exercise-catalog.mjs seeds/exercises/core.json
 *
 * Detects two shapes:
 *   - Bundled catalog: { categories: { <cat>: { exercises: [...] } } }
 *     - each exercise has: id, name.es/en, difficulty, equipment
 *   - Seed file: { subcategories: [{ exercises: [...] }] }
 *     - each exercise has: slug, name.es (name.en optional), difficulty_level, equipment
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);

/** Load and parse a JSON file, throws on parse errors. */
function loadJson(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Flatten a bundled catalog into a list of exercise objects.
 * Each exercise already has: id, name, difficulty, equipment.
 */
function flattenBundled(catalog) {
  const exercises = [];
  const categories = catalog.categories ?? {};
  for (const [catKey, catVal] of Object.entries(categories)) {
    const exList = catVal?.exercises ?? [];
    for (const ex of exList) {
      exercises.push({ _source: `category:${catKey}`, ...ex });
    }
  }
  return exercises;
}

/**
 * Flatten a seed file into a list of exercise objects.
 * Seed exercises use: slug (→ id), name.es (name.en optional), difficulty_level, equipment.
 * We normalise them to the bundled shape for unified checking.
 */
function flattenSeed(seed) {
  const exercises = [];
  const subcategories = seed.subcategories ?? [];
  for (const sub of subcategories) {
    const subSlug = sub.slug ?? '?';
    for (const ex of (sub.exercises ?? [])) {
      // Normalise seed shape → bundled shape keys for unified validation
      exercises.push({
        _source: `subcategory:${subSlug}`,
        id: ex.slug,          // seed uses slug as the id
        name: ex.name,
        difficulty: ex.difficulty_level,  // seed uses difficulty_level
        equipment: ex.equipment,
        description: ex.description,
        _raw: ex,
      });
    }
  }
  return exercises;
}

/**
 * Detect shape: bundled catalog has top-level "categories" key,
 * seed files have top-level "subcategories" key.
 */
function detectShape(data) {
  if (data.categories != null) return 'bundled';
  if (data.subcategories != null) return 'seed';
  // Could also be category-root (seed files have category + subcategories at root)
  if (data.category != null && data.subcategories != null) return 'seed';
  throw new Error(
    'Unknown JSON shape: expected "categories" (bundled catalog) or "subcategories" (seed file).'
  );
}

/**
 * Main validation function. Returns { errors, warnings, total }.
 */
function validate(exercises) {
  const errors = [];
  const warnings = [];

  // Track seen ids for duplicate detection
  const seenIds = new Map(); // id → first _source
  // Track display names per locale for duplicate-name detection
  const seenNamesEs = new Map(); // name_es → first id
  const seenNamesEn = new Map(); // name_en → first id

  let missingDescCount = 0;

  for (const ex of exercises) {
    const loc = `[${ex._source ?? '?'} id="${ex.id ?? '(none)'}"]`;

    // 1. Duplicate id (hard error)
    const rawId = ex.id;
    if (rawId == null || rawId === '') {
      errors.push(`${loc} Missing or empty "id" field.`);
    } else if (seenIds.has(rawId)) {
      errors.push(
        `${loc} Duplicate id "${rawId}" — also seen in ${seenIds.get(rawId)}.`
      );
    } else {
      seenIds.set(rawId, ex._source ?? '?');
    }

    // 2. Missing/empty name (hard error)
    const name = ex.name;
    if (name == null || typeof name !== 'object') {
      errors.push(`${loc} Missing "name" field.`);
    } else {
      if (!name.es || typeof name.es !== 'string' || name.es.trim() === '') {
        errors.push(`${loc} Missing or empty name.es.`);
      }
      if (!name.en || typeof name.en !== 'string' || name.en.trim() === '') {
        errors.push(`${loc} Missing or empty name.en.`);
      }
    }

    // 3. Invalid difficulty (hard error) — check both "difficulty" and "difficulty_level"
    const diff = ex.difficulty ?? ex._raw?.difficulty_level;
    if (diff == null || diff === '') {
      errors.push(`${loc} Missing "difficulty" (or "difficulty_level") field.`);
    } else if (!VALID_DIFFICULTIES.has(diff)) {
      errors.push(
        `${loc} Invalid difficulty "${diff}" — must be beginner|intermediate|advanced.`
      );
    }

    // 4. Missing equipment array (hard error; empty [] is valid = bodyweight)
    const equipment = ex.equipment;
    if (equipment == null) {
      errors.push(`${loc} Missing "equipment" field (use [] for bodyweight).`);
    } else if (!Array.isArray(equipment)) {
      errors.push(`${loc} "equipment" must be an array.`);
    }

    // 5. Duplicate display name (warning) — check per locale
    if (name && typeof name === 'object') {
      const nameEs = name.es?.trim();
      const nameEn = name.en?.trim();

      if (nameEs) {
        if (seenNamesEs.has(nameEs)) {
          warnings.push(
            `Duplicate es name "${nameEs}" — ids: "${seenNamesEs.get(nameEs)}" and "${rawId}".`
          );
        } else {
          seenNamesEs.set(nameEs, rawId);
        }
      }

      if (nameEn) {
        if (seenNamesEn.has(nameEn)) {
          warnings.push(
            `Duplicate en name "${nameEn}" — ids: "${seenNamesEn.get(nameEn)}" and "${rawId}".`
          );
        } else {
          seenNamesEn.set(nameEn, rawId);
        }
      }
    }

    // 6. Missing description (warning — not a hard error yet)
    const desc = ex.description ?? ex._raw?.description;
    if (desc == null || (typeof desc === 'object' && !desc.es && !desc.en)) {
      missingDescCount++;
    }
  }

  if (missingDescCount > 0) {
    warnings.push(
      `${missingDescCount}/${exercises.length} exercises missing description (not a hard error).`
    );
  }

  return { errors, warnings, total: exercises.length };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/validate-exercise-catalog.mjs <path-to-catalog.json>');
    process.exit(1);
  }

  const filePath = resolve(args[0]);
  let data;
  try {
    data = loadJson(filePath);
  } catch (err) {
    console.error(`ERROR: Failed to parse JSON at "${filePath}": ${err.message}`);
    process.exit(1);
  }

  let exercises;
  let shape;
  try {
    shape = detectShape(data);
    if (shape === 'bundled') {
      exercises = flattenBundled(data);
    } else {
      exercises = flattenSeed(data);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  const { errors, warnings, total } = validate(exercises);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  WARN  ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ERROR ${e}`);
    }
    console.log(
      `\nFAIL: ${total} exercises, ${errors.length} errors, ${warnings.length} warnings  [shape=${shape}]`
    );
    process.exit(1);
  }

  console.log(
    `OK: ${total} exercises, 0 errors, ${warnings.length} warnings  [shape=${shape}]`
  );
}

main();
