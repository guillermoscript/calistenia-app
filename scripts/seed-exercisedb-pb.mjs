#!/usr/bin/env node
/**
 * Seed the PocketBase exercises_catalog collection with the ExerciseDB layer
 * of the bundled catalog (entries with source: "exercisedb").
 *
 * Idempotent: upserts by slug (= bundled catalog id, e.g. "dumbbell_bench_press").
 * Existing records are skipped unless --update is passed.
 *
 * Usage:
 *   node scripts/seed-exercisedb-pb.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD> [--dry-run] [--update] [--limit=N]
 *
 * Example (local):
 *   node scripts/seed-exercisedb-pb.mjs http://127.0.0.1:8090 admin@local.test pass --dry-run
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, "../packages/core/data/exercise-catalog.json");

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--"));
const positional = args.filter(a => !a.startsWith("--"));

const [PB_URL, SU_EMAIL, SU_PASSWORD] = positional;
const DRY_RUN = flags.includes("--dry-run");
const UPDATE = flags.includes("--update");
const LIMIT = Number(flags.find(f => f.startsWith("--limit="))?.split("=")[1] || 0);

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error("Usage: node scripts/seed-exercisedb-pb.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD> [--dry-run] [--update] [--limit=N]");
  process.exit(1);
}

let token;
const authH = () => ({ Authorization: `Bearer ${token}` });

async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function buildPayload(ex) {
  return {
    slug: ex.id,
    name: ex.name,
    description: ex.description || { es: "", en: "" },
    muscles: ex.muscles || { es: "", en: "" },
    note: ex.note || { es: "", en: "" },
    category: ex.category || "full",
    difficulty_level: ex.difficulty || "intermediate",
    equipment: ex.equipment || [],
    is_timer: ex.isTimer || false,
    default_sets: ex.sets ?? 3,
    default_reps: ex.reps || "8-12",
    default_rest_seconds: ex.rest ?? 60,
    default_timer_seconds: ex.timerSeconds ?? 0,
    youtube: ex.youtube_query || "",
    priority: "secondary",
    source: "exercisedb",
    status: "official",
  };
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
  let entries = [];
  for (const cat of Object.values(catalog.categories || {})) {
    for (const ex of cat.exercises || []) {
      if (ex.source === "exercisedb") entries.push(ex);
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  if (LIMIT > 0) entries = entries.slice(0, LIMIT);
  console.log(`ExerciseDB entries in bundled catalog: ${entries.length}${DRY_RUN ? " [dry-run]" : ""}`);

  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  });
  token = auth.token;

  // Fetch ALL existing slugs once (paginated) for the idempotency check.
  const existingBySlug = new Map();
  let page = 1;
  for (;;) {
    const res = await api(`/api/collections/exercises_catalog/records?page=${page}&perPage=500&fields=id,slug`, { headers: authH() });
    for (const r of res.items) existingBySlug.set(r.slug, r.id);
    if (page >= res.totalPages) break;
    page++;
  }
  console.log(`Existing records in PB: ${existingBySlug.size}`);

  let created = 0, updated = 0, skipped = 0, failed = 0;

  // Small concurrency pool to keep the run fast without hammering PB.
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < entries.length) {
      const ex = entries[idx++];
      const existingId = existingBySlug.get(ex.id);
      try {
        if (existingId && !UPDATE) { skipped++; continue; }
        if (DRY_RUN) { existingId ? updated++ : created++; continue; }
        if (existingId) {
          await api(`/api/collections/exercises_catalog/records/${existingId}`, {
            method: "PATCH", headers: authH(), body: JSON.stringify(buildPayload(ex)),
          });
          updated++;
        } else {
          await api("/api/collections/exercises_catalog/records", {
            method: "POST", headers: authH(), body: JSON.stringify(buildPayload(ex)),
          });
          created++;
        }
      } catch (e) {
        failed++;
        if (failed <= 5) console.warn(`  FAIL ${ex.id}: ${e.message}`);
      }
      const done = created + updated + skipped + failed;
      if (done % 200 === 0) console.log(`  ${done}/${entries.length}...`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nDone. created=${created} updated=${updated} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
