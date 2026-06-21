#!/usr/bin/env node
/**
 * build-id-map.mjs
 *
 * Phase A: Build a deterministic mapping from seed slug -> canonical catalog id.
 *
 * Outputs:
 *   seeds/exercises/_id-map.json        { "<slug>": "<canonical_id>" }
 *   seeds/exercises/_id-map-report.md   human-review artifact
 *
 * Usage: node scripts/build-id-map.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
// Read the FROZEN pre-merge base, never the merged output. This keeps the
// pipeline idempotent/reproducible: the map is a pure function of (base, seeds)
// and re-running never drifts (see exercise-catalog.base.json).
const BASE_PATH = join(ROOT, 'packages/core/data/exercise-catalog.base.json');
const SEEDS_DIR = join(ROOT, 'seeds/exercises');
const OUT_MAP = join(SEEDS_DIR, '_id-map.json');
const OUT_REPORT = join(SEEDS_DIR, '_id-map-report.md');

// Seed file -> catalog category map
const SEED_CAT_MAP = {
  'push': 'push',
  'pull': 'pull',
  'legs': 'legs',
  'core': 'core',
  'skills': 'skill',
  'mobility': 'movilidad',
  'glutes-lower-back': 'lumbar',
  'cardio': 'full',
};

// Deterministic seed file order (sorted filenames, skip _-prefixed)
const SEED_FILES = Object.keys(SEED_CAT_MAP).sort();

/**
 * Normalize a name for matching.
 * spec: lowercase, strip accents, replace non-alphanum with space, collapse/trim
 */
function norm(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    // strip accents
    .replace(/[áàäâã]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n')
    // replace non-alphanum with space
    .replace(/[^a-z0-9\s]/g, ' ')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  // 1. Load the frozen base catalog, build normName -> Set<id> index
  const catalogRaw = JSON.parse(readFileSync(BASE_PATH, 'utf8'));
  const nameIndex = new Map(); // normName -> Set<id>
  const existingIds = new Set();

  for (const [, catVal] of Object.entries(catalogRaw.categories ?? {})) {
    for (const ex of catVal.exercises ?? []) {
      existingIds.add(ex.id);
      const normEs = norm(ex.name?.es);
      const normEn = norm(ex.name?.en);
      for (const n of [normEs, normEn]) {
        if (!n) continue;
        if (!nameIndex.has(n)) nameIndex.set(n, new Set());
        nameIndex.get(n).add(ex.id);
      }
    }
  }

  console.log(`Catalog loaded: ${existingIds.size} existing exercises`);

  // 2. Iterate seeds deterministically
  const idMap = {}; // slug -> canonical_id
  const newIdsSoFar = new Set(); // track NEW ids to avoid collisions
  // Track which existing ids are claimed (first claim wins)
  const claimedIds = new Map(); // existingId -> first slug that claimed it

  // Classification buckets for report
  const matched = [];     // { slug, canonicalId, nameEs, nameEn }
  const ambiguous = [];   // { slug, nameEs, nameEn, candidates }
  const derivedCollisions = []; // { slug, derivedId, nameEs, nameEn }
  const multiClaim = [];  // { slug, id, firstSlug } — extra claims, not applied
  const newEntries = [];  // { slug, newId, nameEs, nameEn }

  for (const seedFile of SEED_FILES) {
    const seedPath = join(SEEDS_DIR, `${seedFile}.json`);
    const seedData = JSON.parse(readFileSync(seedPath, 'utf8'));

    for (const sub of seedData.subcategories ?? []) {
      for (const ex of sub.exercises ?? []) {
        const slug = ex.slug;
        const nameEs = ex.name?.es ?? '';
        const nameEn = ex.name?.en ?? '';
        const derivedId = slug.replace(/-/g, '_');

        // Build hitIds
        const hitIds = new Set();
        const normEs = norm(nameEs);
        const normEn = norm(nameEn);
        for (const n of [normEs, normEn]) {
          if (!n) continue;
          const hits = nameIndex.get(n);
          if (hits) for (const id of hits) hitIds.add(id);
        }

        let canonicalId;

        if (hitIds.size === 1) {
          // Exactly one match
          const matchedId = [...hitIds][0];
          if (claimedIds.has(matchedId)) {
            // Multi-claim: first seed wins
            multiClaim.push({ slug, id: matchedId, firstSlug: claimedIds.get(matchedId) });
            // Treat as new entry with derivedId
            canonicalId = derivedId;
            let suffix = 2;
            while (existingIds.has(canonicalId) || newIdsSoFar.has(canonicalId)) {
              canonicalId = `${derivedId}_${suffix++}`;
            }
            newIdsSoFar.add(canonicalId);
            newEntries.push({ slug, newId: canonicalId, nameEs, nameEn, reason: 'multiClaim' });
          } else {
            canonicalId = matchedId;
            claimedIds.set(matchedId, slug);
            matched.push({ slug, canonicalId, nameEs, nameEn });
          }
        } else if (hitIds.size > 1) {
          // Ambiguous: multiple candidates, treat as new
          ambiguous.push({ slug, nameEs, nameEn, candidates: [...hitIds] });
          canonicalId = derivedId;
          let suffix = 2;
          while (existingIds.has(canonicalId) || newIdsSoFar.has(canonicalId)) {
            canonicalId = `${derivedId}_${suffix++}`;
          }
          newIdsSoFar.add(canonicalId);
          newEntries.push({ slug, newId: canonicalId, nameEs, nameEn, reason: 'ambiguous' });
        } else {
          // hitIds.size === 0 — no NAME match.
          // We NEVER enrich a name-mismatched existing entry just because the
          // derived id collides: id-string coincidence does not imply the same
          // movement. (e.g. the basic "step-up" seed must NOT overwrite the
          // existing `step_up` entry, which is actually "Step-up Explosivo" and
          // has its own matching `explosive-step-up` seed.) Always create a NEW
          // entry; suffix the id if it collides with an existing or prior id.
          const collidesExisting = existingIds.has(derivedId);
          canonicalId = derivedId;
          let suffix = 2;
          while (existingIds.has(canonicalId) || newIdsSoFar.has(canonicalId)) {
            canonicalId = `${derivedId}_${suffix++}`;
          }
          newIdsSoFar.add(canonicalId);
          newEntries.push({
            slug, newId: canonicalId, nameEs, nameEn,
            reason: collidesExisting ? 'derivedCollision→new' : 'new',
          });
          if (collidesExisting) {
            derivedCollisions.push({ slug, derivedId, assignedId: canonicalId, nameEs, nameEn });
          }
        }

        idMap[slug] = canonicalId;
      }
    }
  }

  // Self-check assertions
  const mapKeys = Object.keys(idMap);
  if (mapKeys.length !== 263) {
    throw new Error(`Expected 263 keys in id-map, got ${mapKeys.length}`);
  }

  // Check no two NEW ids collide
  const newIdsArr = newEntries.map(e => e.newId);
  const newIdsSet = new Set(newIdsArr);
  if (newIdsSet.size !== newIdsArr.length) {
    const dupes = newIdsArr.filter((id, i) => newIdsArr.indexOf(id) !== i);
    throw new Error(`Duplicate new ids detected: ${dupes.join(', ')}`);
  }

  // Existing catalog ids with NO seed (only true name-matches enrich an existing id)
  const enrichedIds = new Set(matched.map(m => m.canonicalId));
  const unseeded = [];
  for (const id of existingIds) {
    if (!enrichedIds.has(id)) {
      // find name
      let name = { es: '', en: '' };
      for (const [, catVal] of Object.entries(catalogRaw.categories ?? {})) {
        const ex = catVal.exercises?.find(e => e.id === id);
        if (ex) { name = ex.name; break; }
      }
      const hasDesc = (() => {
        for (const [, catVal] of Object.entries(catalogRaw.categories ?? {})) {
          const ex = catVal.exercises?.find(e => e.id === id);
          if (ex) return !!(ex.description?.es || ex.description?.en);
        }
        return false;
      })();
      unseeded.push({ id, name, hasDesc });
    }
  }

  // 3. Write _id-map.json
  writeFileSync(OUT_MAP, JSON.stringify(idMap, null, 2) + '\n');
  console.log(`\nWrote ${OUT_MAP}`);
  console.log(`  Total keys: ${mapKeys.length}`);
  console.log(`  Matched: ${matched.length}`);
  console.log(`  Derived-id collisions (→ new entry, name mismatch): ${derivedCollisions.length}`);
  console.log(`  Ambiguous (treated as new): ${ambiguous.length}`);
  console.log(`  Multi-claim (later ones as new): ${multiClaim.length}`);
  console.log(`  New entries: ${newEntries.length}`);
  console.log(`  Existing ids with no seed: ${unseeded.length}`);

  // 4. Write _id-map-report.md
  const lines = [];
  lines.push('# Exercise ID Map Report');
  lines.push('');
  lines.push('Auto-generated by `scripts/build-id-map.mjs`. Human review required for REVIEW sections.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total seed entries | ${mapKeys.length} |`);
  lines.push(`| Matched to existing id (by name) | ${matched.length} |`);
  lines.push(`| Derived-id collisions → new entry (name mismatch) | ${derivedCollisions.length} |`);
  lines.push(`| Ambiguous (multiple catalog hits → new) | ${ambiguous.length} |`);
  lines.push(`| Multi-claim extras (first seed wins, later → new) | ${multiClaim.length} |`);
  lines.push(`| New entries | ${newEntries.length} |`);
  lines.push(`| Existing catalog ids with no seed | ${unseeded.length} |`);
  lines.push('');

  lines.push('## Matched (slug → id, name)');
  lines.push('');
  lines.push('These seeds will ENRICH the existing entry (overwrite description, difficulty, equipment, muscles).');
  lines.push('');
  lines.push('| Slug | Canonical ID | Name ES | Name EN |');
  lines.push('|------|-------------|---------|---------|');
  for (const m of matched) {
    lines.push(`| ${m.slug} | ${m.canonicalId} | ${m.nameEs} | ${m.nameEn} |`);
  }
  lines.push('');

  if (ambiguous.length > 0) {
    lines.push('## Ambiguous — REVIEW REQUIRED');
    lines.push('');
    lines.push('These seeds matched multiple catalog entries. Treated as NEW entries to avoid wrong enrichment.');
    lines.push('');
    lines.push('| Slug | Name ES | Name EN | Candidates |');
    lines.push('|------|---------|---------|------------|');
    for (const a of ambiguous) {
      lines.push(`| ${a.slug} | ${a.nameEs} | ${a.nameEn} | ${a.candidates.join(', ')} |`);
    }
    lines.push('');
  }

  if (derivedCollisions.length > 0) {
    lines.push('## Derived-ID Collisions → New Entry — REVIEW REQUIRED');
    lines.push('');
    lines.push('Slug → derivedId equals an existing catalog id but the NAMES did not match,');
    lines.push('so this seed is a DIFFERENT movement. Added as a NEW entry under `Assigned ID`');
    lines.push('(the existing entry is left untouched / matched by its own name-matching seed).');
    lines.push('');
    lines.push('| Slug | Collided Existing ID | Assigned New ID | Name ES | Name EN |');
    lines.push('|------|---------------------|-----------------|---------|---------|');
    for (const d of derivedCollisions) {
      lines.push(`| ${d.slug} | ${d.derivedId} | ${d.assignedId} | ${d.nameEs} | ${d.nameEn} |`);
    }
    lines.push('');
  }

  if (multiClaim.length > 0) {
    lines.push('## Multiple Seeds → Same ID — REVIEW REQUIRED');
    lines.push('');
    lines.push('Only the FIRST claim enriches the existing entry. Later claims are added as NEW entries.');
    lines.push('');
    lines.push('| Slug | Target ID | First Claimant |');
    lines.push('|------|-----------|----------------|');
    for (const mc of multiClaim) {
      lines.push(`| ${mc.slug} | ${mc.id} | ${mc.firstSlug} |`);
    }
    lines.push('');
  }

  lines.push('## New Entries (slug → new id)');
  lines.push('');
  lines.push('These seeds will be added as brand-new exercises in the catalog.');
  lines.push('');
  lines.push('| Slug | New ID | Name ES | Name EN | Reason |');
  lines.push('|------|--------|---------|---------|--------|');
  for (const n of newEntries) {
    lines.push(`| ${n.slug} | ${n.newId} | ${n.nameEs} | ${n.nameEn} | ${n.reason} |`);
  }
  lines.push('');

  lines.push('## Existing Catalog IDs With No Seed');
  lines.push('');
  lines.push('These keep their current data unchanged.');
  lines.push('');
  lines.push('| ID | Name ES | Name EN | Has Description |');
  lines.push('|----|---------|---------|-----------------|');
  for (const u of unseeded) {
    lines.push(`| ${u.id} | ${u.name.es} | ${u.name.en} | ${u.hasDesc} |`);
  }
  lines.push('');

  writeFileSync(OUT_REPORT, lines.join('\n'));
  console.log(`Wrote ${OUT_REPORT}`);
}

main();
