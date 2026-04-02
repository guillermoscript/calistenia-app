#!/usr/bin/env node
/**
 * Seed script: creates the "Intermedio – Balance Total" program.
 *
 * Usage:
 *   node scripts/seed-program.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>
 *
 * Example:
 *   node scripts/seed-program.mjs https://your-pb.guille.tech admin@calistenia.app admin123456
 *
 * The script will:
 *   1. Auth as superuser
 *   2. Create the program + phases + exercises from intermedio_balance_total.json
 *
 * All text fields are wrapped in i18n JSON format: {"es": "value"}
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PB_URL = process.argv[2];
const SU_EMAIL = process.argv[3];
const SU_PASSWORD = process.argv[4];

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error("Usage: node scripts/seed-program.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(resolve(__dirname, "../intermedio_balance_total.json"), "utf-8"));

/** Wrap a plain string in i18n JSON format: { "es": value } */
function i18n(value) {
  if (!value) return { es: "" };
  if (typeof value === "object") return value;
  return { es: value };
}

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
  return res.json();
}

async function main() {
  // 1. Auth as superuser
  console.log("🔑 Authenticating as superuser...");
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  });
  const token = auth.token;
  const authH = { Authorization: `Bearer ${token}` };
  console.log("  ✓ Authenticated");

  // 2. Check if program already exists (search by i18n name)
  const existing = await api(`/api/collections/programs/records?perPage=100`, {
    headers: authH,
  });
  const found = existing.items?.find(p => {
    const name = typeof p.name === 'object' ? (p.name.es || p.name.en || '') : (p.name || '')
    return name.includes('Intermedio') || name.includes('Balance Total')
  });
  if (found) {
    console.log(`  ⚠ Program "${data.program.name}" already exists (${found.id}). Skipping.`);
    console.log(`  💡 To re-seed, run: node scripts/repair-program-data.mjs ${PB_URL} ${SU_EMAIL} <PASSWORD>`);
    return;
  }

  // 3. Create program
  console.log(`📋 Creating program: ${data.program.name}`);
  const prog = await api("/api/collections/programs/records", {
    method: "POST",
    headers: authH,
    body: JSON.stringify({
      name: i18n(data.program.name),
      description: i18n(data.program.description),
      duration_weeks: data.program.duration_weeks,
      difficulty: data.program.difficulty || "intermediate",
      is_active: true,
      is_official: true,
      is_featured: true,
    }),
  });
  console.log(`  ✓ Program created: ${prog.id}`);

  // 4. Create phases
  for (const phase of data.phases) {
    console.log(`  📁 Phase ${phase.phase_number}: ${phase.name}`);
    await api("/api/collections/program_phases/records", {
      method: "POST",
      headers: authH,
      body: JSON.stringify({
        program: prog.id,
        phase_number: phase.phase_number,
        name: i18n(phase.name),
        weeks: phase.weeks,
        color: phase.color || "",
        sort_order: phase.phase_number,
      }),
    });

    // 5. Create exercises for each day
    for (const day of phase.days) {
      console.log(`    📅 ${day.day_name}: ${day.workout_title} (${day.exercises.length} exercises)`);
      for (const ex of day.exercises) {
        await api("/api/collections/program_exercises/records", {
          method: "POST",
          headers: authH,
          body: JSON.stringify({
            program: prog.id,
            phase_number: phase.phase_number,
            day_id: day.day_id,
            day_name: i18n(day.day_name),
            day_focus: i18n(day.day_focus),
            workout_title: i18n(day.workout_title),
            exercise_id: `${day.day_id}_${phase.phase_number}_${ex.sort_order}`,
            exercise_name: i18n(ex.name),
            sets: ex.sets,
            reps: ex.reps || "",
            rest_seconds: ex.rest_seconds || 0,
            muscles: i18n(ex.muscles || ""),
            note: i18n(ex.note || ""),
            youtube: ex.youtube || "",
            priority: ex.priority || "primary",
            is_timer: ex.is_timer || false,
            timer_seconds: ex.timer_seconds || 0,
            sort_order: ex.sort_order,
          }),
        });
      }
      console.log(`      ✓ ${day.exercises.length} exercises created`);
    }
  }

  console.log("\n✅ Program seeded successfully!");
  console.log(`   Program ID: ${prog.id}`);
  console.log(`   Phases: ${data.phases.length}`);
  console.log(`   Total exercises: ${data.phases.reduce((sum, p) => sum + p.days.reduce((s, d) => s + d.exercises.length, 0), 0)}`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
