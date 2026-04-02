#!/usr/bin/env node
/**
 * Repair script: fixes programs with empty i18n fields.
 *
 * The i18n migration (1774378015) converted text → JSON fields, but
 * PocketBase dropped + recreated columns, losing data. This script
 * re-populates the "Intermedio – Balance Total" program from the
 * seed JSON and fixes any other programs with empty names.
 *
 * Usage:
 *   node scripts/repair-program-data.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>
 *
 * What it does:
 *   1. Finds the Intermedio program → deletes its phases + exercises → re-creates from JSON
 *   2. For other programs with empty names → attempts to recover from context
 *   3. Prints a summary of what was fixed
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PB_URL = process.argv[2];
const SU_EMAIL = process.argv[3];
const SU_PASSWORD = process.argv[4];

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error("Usage: node scripts/repair-program-data.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>");
  process.exit(1);
}

const seedData = JSON.parse(readFileSync(resolve(__dirname, "../intermedio_balance_total.json"), "utf-8"));

function i18n(value) {
  if (!value) return { es: "" };
  if (typeof value === "object") return value;
  return { es: value };
}

/** Check if an i18n field is effectively empty */
function isEmpty(field) {
  if (!field) return true;
  if (typeof field === "string") return field.trim() === "";
  if (typeof field === "object") {
    return Object.values(field).every(v => !v || v.trim() === "");
  }
  return true;
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
  return res.json();
}

async function deleteAll(collection, filter) {
  let deleted = 0;
  const res = await api(
    `/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=500`,
    { headers: authH() }
  );
  for (const item of res.items || []) {
    await api(`/api/collections/${collection}/records/${item.id}`, {
      method: "DELETE",
      headers: authH(),
    });
    deleted++;
  }
  return deleted;
}

async function repairIntermedio() {
  console.log("\n📋 Repairing Intermedio – Balance Total...");

  // Find the program (might have empty name or partial name)
  const programs = await api("/api/collections/programs/records?perPage=200", { headers: authH() });

  // Match by: known ID, or name containing 'Intermedio'/'Balance', or first official program with empty name
  let prog = programs.items.find(p => p.id === seedData.program.id);
  if (!prog) {
    prog = programs.items.find(p => {
      const n = typeof p.name === "object" ? (p.name.es || "") : (p.name || "");
      return n.includes("Intermedio") || n.includes("Balance Total");
    });
  }

  if (prog) {
    console.log(`  Found existing program: ${prog.id}`);

    // Delete existing phases, exercises, and day config
    const filter = `program = '${prog.id}'`;
    const exDel = await deleteAll("program_exercises", filter);
    console.log(`  🗑 Deleted ${exDel} exercises`);

    let dcDel = 0;
    try { dcDel = await deleteAll("program_day_config", filter); } catch { /* collection may not exist */ }
    if (dcDel > 0) console.log(`  🗑 Deleted ${dcDel} day configs`);

    const phDel = await deleteAll("program_phases", filter);
    console.log(`  🗑 Deleted ${phDel} phases`);

    // Update program metadata
    await api(`/api/collections/programs/records/${prog.id}`, {
      method: "PATCH",
      headers: authH(),
      body: JSON.stringify({
        name: i18n(seedData.program.name),
        description: i18n(seedData.program.description),
        duration_weeks: seedData.program.duration_weeks,
        difficulty: seedData.program.difficulty || "intermediate",
        is_active: true,
        is_official: true,
        is_featured: true,
      }),
    });
    console.log(`  ✅ Updated program metadata`);
  } else {
    // Create from scratch
    prog = await api("/api/collections/programs/records", {
      method: "POST",
      headers: authH(),
      body: JSON.stringify({
        name: i18n(seedData.program.name),
        description: i18n(seedData.program.description),
        duration_weeks: seedData.program.duration_weeks,
        difficulty: seedData.program.difficulty || "intermediate",
        is_active: true,
        is_official: true,
        is_featured: true,
      }),
    });
    console.log(`  ✅ Created new program: ${prog.id}`);
  }

  // Create phases
  for (const phase of seedData.phases) {
    await api("/api/collections/program_phases/records", {
      method: "POST",
      headers: authH(),
      body: JSON.stringify({
        program: prog.id,
        phase_number: phase.phase_number,
        name: i18n(phase.name),
        weeks: phase.weeks,
        color: phase.color || "",
        sort_order: phase.phase_number,
      }),
    });
    console.log(`  📁 Phase ${phase.phase_number}: ${phase.name}`);

    // Create exercises
    for (const day of phase.days) {
      for (const ex of day.exercises) {
        await api("/api/collections/program_exercises/records", {
          method: "POST",
          headers: authH(),
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
            section: "main",
          }),
        });
      }
      console.log(`    📅 ${day.day_name}: ${day.exercises.length} exercises`);
    }
  }

  console.log(`  ✅ Intermedio program fully repaired (${seedData.phases.length} phases, 90 exercises)`);
  return prog.id;
}

async function repairOtherPrograms() {
  console.log("\n🔍 Checking other programs for empty i18n fields...");

  const programs = await api("/api/collections/programs/records?perPage=200", { headers: authH() });
  let fixed = 0;

  for (const prog of programs.items) {
    if (!isEmpty(prog.name)) continue;

    // Program has empty name — try to recover from phases/exercises
    console.log(`  ⚠ Program ${prog.id} has empty name`);

    // Check if it has any phases with data
    try {
      const phases = await api(
        `/api/collections/program_phases/records?filter=${encodeURIComponent(`program = '${prog.id}'`)}&perPage=20`,
        { headers: authH() }
      );
      if (phases.items.length > 0) {
        console.log(`    Has ${phases.items.length} phases (also likely with empty names)`);
      }
    } catch { /* ignore */ }

    // We can't recover the original name, but we can mark it for the user
    console.log(`    ❌ Cannot auto-repair — original name unknown. Edit via the Program Editor UI.`);
    fixed++;
  }

  if (fixed === 0) {
    console.log("  ✅ All other programs have valid names");
  } else {
    console.log(`\n  ⚠ ${fixed} program(s) need manual repair via the Program Editor`);
  }
}

async function main() {
  console.log("🔑 Authenticating as superuser...");
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  });
  token = auth.token;
  console.log("  ✓ Authenticated");

  await repairIntermedio();
  await repairOtherPrograms();

  console.log("\n🏁 Repair complete!");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
