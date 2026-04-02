#!/usr/bin/env node
/**
 * Seed script: populates exercises_catalog and exercise_progressions
 * from the JSON seed files in seeds/exercises/.
 *
 * Usage:
 *   node scripts/seed-exercises.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD> [--dry-run] [--category=push]
 *
 * Options:
 *   --dry-run       Print what would be created without making API calls
 *   --category=X    Only seed a specific category (push, pull, legs, core, etc.)
 *   --clean         Delete all official exercises before seeding (fresh start)
 *
 * Example:
 *   node scripts/seed-exercises.mjs https://gym.guille.tech admin@app.com pass123
 *   node scripts/seed-exercises.mjs https://gym.guille.tech admin@app.com pass123 --category=push
 *   node scripts/seed-exercises.mjs https://gym.guille.tech admin@app.com pass123 --dry-run
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = resolve(__dirname, "../seeds/exercises");

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--"));
const positional = args.filter(a => !a.startsWith("--"));

const PB_URL = positional[0];
const SU_EMAIL = positional[1];
const SU_PASSWORD = positional[2];

const DRY_RUN = flags.includes("--dry-run");
const CLEAN = flags.includes("--clean");
const CATEGORY_FILTER = flags.find(f => f.startsWith("--category="))?.split("=")[1];

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error("Usage: node scripts/seed-exercises.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD> [--dry-run] [--category=push] [--clean]");
  process.exit(1);
}

let token;
const authH = () => ({ Authorization: `Bearer ${token}` });

async function api(path, opts = {}) {
  const url = `${PB_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function loadSeedFiles() {
  const files = readdirSync(SEEDS_DIR)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

  const seeds = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(SEEDS_DIR, file), "utf-8"));
    if (CATEGORY_FILTER && data.category !== CATEGORY_FILTER) continue;
    seeds.push({ file, ...data });
  }
  return seeds;
}

async function cleanExistingExercises() {
  console.log("\n🗑  Cleaning existing official exercises...");
  let page = 1;
  let deleted = 0;
  while (true) {
    const res = await api(
      `/api/collections/exercises_catalog/records?filter=${encodeURIComponent('status = "official"')}&perPage=200&page=${page}`,
      { headers: authH() }
    );
    if (!res.items || res.items.length === 0) break;
    for (const item of res.items) {
      await api(`/api/collections/exercises_catalog/records/${item.id}`, {
        method: "DELETE",
        headers: authH(),
      });
      deleted++;
    }
    // Don't increment page — we're deleting from page 1 each time
  }
  console.log(`   Deleted ${deleted} exercises`);

  // Clean progressions too
  let progDeleted = 0;
  while (true) {
    const res = await api(
      `/api/collections/exercise_progressions/records?perPage=200&page=1`,
      { headers: authH() }
    );
    if (!res.items || res.items.length === 0) break;
    for (const item of res.items) {
      await api(`/api/collections/exercise_progressions/records/${item.id}`, {
        method: "DELETE",
        headers: authH(),
      });
      progDeleted++;
    }
  }
  if (progDeleted > 0) console.log(`   Deleted ${progDeleted} progressions`);
}

async function seedCategory(seedData) {
  const { category, subcategories, file } = seedData;
  console.log(`\n📂 ${category} (${file})`);

  const exerciseIdMap = {}; // slug → PB record ID (for progressions)
  let created = 0;
  let skipped = 0;

  for (const sub of subcategories) {
    const subName = sub.name.en || sub.name.es;
    console.log(`  📁 ${subName} (${sub.exercises.length} exercises)`);

    for (const ex of sub.exercises) {
      const slug = ex.slug;

      // Check if already exists
      try {
        const existing = await api(
          `/api/collections/exercises_catalog/records?filter=${encodeURIComponent(`slug = "${slug}"`)}&perPage=1`,
          { headers: authH() }
        );
        if (existing.items && existing.items.length > 0) {
          exerciseIdMap[slug] = existing.items[0].id;
          skipped++;
          continue;
        }
      } catch { /* proceed to create */ }

      if (DRY_RUN) {
        console.log(`    [dry-run] Would create: ${ex.name.en || ex.name.es}`);
        created++;
        continue;
      }

      const record = await api("/api/collections/exercises_catalog/records", {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          name: ex.name,
          slug: ex.slug,
          description: ex.description || { es: "", en: "" },
          muscles: ex.muscles,
          category: category,
          difficulty_level: ex.difficulty_level,
          equipment: ex.equipment || [],
          is_timer: ex.is_timer || false,
          default_sets: ex.default_sets || 3,
          default_reps: ex.default_reps || "",
          default_rest_seconds: ex.default_rest_seconds || 60,
          default_timer_seconds: ex.default_timer_seconds || 0,
          youtube: ex.youtube || "",
          note: ex.note || { es: "", en: "" },
          priority: ex.priority || "primary",
          source: ex.source || "catalog",
          status: ex.status || "official",
        }),
      });

      exerciseIdMap[slug] = record.id;
      created++;
    }

    // Build progression chain for this subcategory
    const sorted = [...sub.exercises].sort((a, b) => a.progression_order - b.progression_order);
    for (let i = 0; i < sorted.length; i++) {
      const ex = sorted[i];
      const recordId = exerciseIdMap[ex.slug];
      if (!recordId && !DRY_RUN) continue;

      const prevSlug = i > 0 ? sorted[i - 1].slug : null;
      const nextSlug = i < sorted.length - 1 ? sorted[i + 1].slug : null;

      if (DRY_RUN) continue;

      try {
        await api("/api/collections/exercise_progressions/records", {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({
            exercise_id: ex.slug,
            exercise_name: ex.name.en || ex.name.es,
            category: category,
            difficulty_order: ex.progression_order,
            prev_exercise_id: prevSlug || "",
            next_exercise_id: nextSlug || "",
            target_reps_to_advance: ex.target_reps_to_advance || 12,
            sessions_at_target: ex.sessions_at_target || 3,
          }),
        });
      } catch (e) {
        console.log(`    ⚠ Progression for ${ex.slug}: ${e.message}`);
      }
    }
  }

  const totalInCategory = subcategories.reduce((sum, s) => sum + s.exercises.length, 0);
  console.log(`  ✅ ${created} created, ${skipped} skipped (already exist), ${totalInCategory} total`);
  return { created, skipped };
}

async function main() {
  const seeds = loadSeedFiles();
  if (seeds.length === 0) {
    console.error("No seed files found" + (CATEGORY_FILTER ? ` for category "${CATEGORY_FILTER}"` : ""));
    process.exit(1);
  }

  console.log(`🌱 Exercise Catalog Seeder`);
  console.log(`   URL: ${PB_URL}`);
  console.log(`   Files: ${seeds.map(s => s.file).join(", ")}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  if (!DRY_RUN) {
    console.log("\n🔑 Authenticating...");
    const auth = await api("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
    });
    token = auth.token;
    console.log("   ✓ Authenticated");

    if (CLEAN) {
      await cleanExistingExercises();
    }
  }

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const seed of seeds) {
    const { created, skipped } = await seedCategory(seed);
    totalCreated += created;
    totalSkipped += skipped;
  }

  console.log(`\n🏁 Done! ${totalCreated} exercises created, ${totalSkipped} skipped`);
  if (DRY_RUN) console.log("   (dry run — no changes made)");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
