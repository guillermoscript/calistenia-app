#!/usr/bin/env node
/**
 * Seed a yoga program via PocketBase API from a JSON file.
 *
 * Usage:
 *   node scripts/seed-yoga-program.mjs <json-file> [pb-url]
 *
 * Examples:
 *   node scripts/seed-yoga-program.mjs ashtanga-yoga-seed.json
 *   node scripts/seed-yoga-program.mjs ashtanga-yoga-seed.json https://pb.example.com
 *
 * Environment:
 *   PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD — superuser credentials
 *   POCKETBASE_URL — default PB URL (fallback: http://127.0.0.1:8090)
 */

import { readFileSync } from "fs";

const [,, jsonPath, pbUrlArg] = process.argv;
if (!jsonPath) {
  console.error("Usage: node scripts/seed-yoga-program.mjs <json-file> [pb-url]");
  process.exit(1);
}

const PB_URL = pbUrlArg || process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL;
const SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD;

if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
  console.error("Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars");
  process.exit(1);
}

const input = JSON.parse(readFileSync(jsonPath, "utf-8"));

// Detect if PB uses JSON or text fields for i18n — set after schema check
let useJsonFields = false;

function t(value) {
  return useJsonFields ? { es: value } : value;
}

async function pb(method, path, body) {
  const res = await fetch(`${PB_URL}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

let token = "";

async function main() {
  // 1. Auth as superuser
  console.log(`Connecting to ${PB_URL}...`);
  const auth = await pb("POST", "/collections/_superusers/auth-with-password", {
    identity: SUPERUSER_EMAIL,
    password: SUPERUSER_PASSWORD,
  });
  token = auth.token;
  console.log("✓ Authenticated as superuser");

  // Detect field types (json vs text)
  const schema = await pb("GET", "/collections/programs");
  const nameField = schema.fields?.find((f) => f.name === "name");
  useJsonFields = nameField?.type === "json";
  console.log(`  Field type: ${nameField?.type || "unknown"} → ${useJsonFields ? "JSON i18n" : "plain text"}`);

  // 2. Check if program already exists
  const existing = await pb("GET", `/collections/programs/records?filter=name~'Ashtanga Yoga'&perPage=1`);
  if (existing.totalItems > 0) {
    console.log(`⚠ Program "${existing.items[0].name?.es || existing.items[0].name}" already exists (ID: ${existing.items[0].id})`);
    console.log("  Delete it first if you want to re-seed.");
    process.exit(1);
  }

  // 3. Create program
  const program = await pb("POST", "/collections/programs/records", {
    name: t(input.program.name),
    description: t(input.program.description || ""),
    duration_weeks: input.program.duration_weeks || 0,
    difficulty: input.program.difficulty || "",
    is_active: true,
    is_official: input.is_official ?? true,
  });
  console.log(`✓ Created program "${input.program.name}" (ID: ${program.id})`);

  let totalExercises = 0;
  let totalDayConfigs = 0;
  let totalPhases = 0;

  for (const phase of input.phases) {
    // 4. Create phase
    await pb("POST", "/collections/program_phases/records", {
      program: program.id,
      phase_number: phase.phase_number,
      name: t(phase.name),
      weeks: phase.weeks || "",
      color: phase.color || "#888",
      sort_order: phase.phase_number,
    });
    totalPhases++;
    console.log(`  ✓ Phase ${phase.phase_number}: ${phase.name}`);

    // 5. Create day configs + exercises
    for (const day of phase.days) {
      const dayType = day.day_type || "full";

      // Day config
      await pb("POST", "/collections/program_day_config/records", {
        program: program.id,
        phase_number: phase.phase_number,
        day_id: day.day_id,
        day_name: t(day.day_name),
        day_type: dayType,
        day_focus: t(day.day_focus || ""),
        day_color: day.day_color || phase.color || "#888",
        sort_order: phase.days.indexOf(day) + 1,
      });
      totalDayConfigs++;

      // Exercises (skip rest days)
      for (let i = 0; i < day.exercises.length; i++) {
        const ex = day.exercises[i];
        await pb("POST", "/collections/program_exercises/records", {
          program: program.id,
          phase_number: phase.phase_number,
          day_id: day.day_id,
          day_name: t(day.day_name),
          day_focus: t(day.day_focus || ""),
          day_type: dayType,
          day_color: day.day_color || phase.color || "#888",
          workout_title: t(day.workout_title || day.day_focus || ""),
          exercise_id: ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, ""),
          exercise_name: t(ex.name),
          sets: ex.sets ?? 1,
          reps: ex.reps || "1",
          rest_seconds: ex.rest_seconds ?? 0,
          muscles: t(ex.muscles || ""),
          note: t(ex.note || ""),
          youtube: ex.youtube || "",
          is_timer: ex.is_timer || false,
          timer_seconds: ex.timer_seconds || 0,
          sort_order: ex.sort_order ?? i + 1,
          priority: ex.priority || "primary",
          section: ex.section || "main",
        });
        totalExercises++;
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Program: ${input.program.name} (${program.id})`);
  console.log(`   ${totalPhases} phases, ${totalDayConfigs} day configs, ${totalExercises} exercises`);
}

main().catch((err) => {
  console.error("✗ Error:", err.message);
  process.exit(1);
});
