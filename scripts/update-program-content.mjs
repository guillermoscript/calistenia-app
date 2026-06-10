#!/usr/bin/env node
/**
 * Replace skeleton program stubs with real exercise content.
 *
 * Usage:
 *   node scripts/update-program-content.mjs <PB_URL> <EMAIL> <PASSWORD> [program-slug]
 *
 * If program-slug is omitted, processes ALL JSON files in programs/.
 * If provided, processes only programs/<slug>.json.
 *
 * For each program JSON:
 *   1. Find the existing program record by matching the Spanish name
 *   2. Delete all existing program_exercises for that program
 *   3. Delete all existing program_phases for that program
 *   4. Re-create phases and exercises from the JSON
 */

import { readFileSync, readdirSync } from "fs"
import { resolve, dirname, basename } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROGRAMS_DIR = resolve(__dirname, "../programs")

const PB_URL = process.argv[2]
const SU_EMAIL = process.argv[3]
const SU_PASSWORD = process.argv[4]
const SLUG_FILTER = process.argv[5]

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error("Usage: node scripts/update-program-content.mjs <PB_URL> <EMAIL> <PASSWORD> [slug]")
  process.exit(1)
}

function i18n(value) {
  if (!value) return { es: "" }
  if (typeof value === "object") return value
  return { es: value }
}

async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${path}: ${body}`)
  }
  if (res.status === 204 || opts.method === "DELETE") return {}
  return res.json()
}

async function fetchAll(path, authH) {
  let page = 1
  let items = []
  while (true) {
    const res = await api(`${path}${path.includes('?') ? '&' : '?'}perPage=200&page=${page}`, { headers: authH })
    items = items.concat(res.items)
    if (items.length >= res.totalItems) break
    page++
  }
  return items
}

async function main() {
  console.log("🔑 Authenticating...")
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  })
  const authH = { Authorization: `Bearer ${auth.token}` }
  console.log("  ✓ Authenticated\n")

  const allPrograms = await fetchAll("/api/collections/programs/records", authH)

  const files = readdirSync(PROGRAMS_DIR)
    .filter(f => f.endsWith(".json"))
    .filter(f => !SLUG_FILTER || f === `${SLUG_FILTER}.json`)

  if (files.length === 0) {
    console.error(`No JSON files found${SLUG_FILTER ? ` for slug "${SLUG_FILTER}"` : ""}`)
    process.exit(1)
  }

  let successCount = 0

  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(PROGRAMS_DIR, file), "utf-8"))
    const programName = data.program.name
    console.log(`\n📋 Processing: ${programName} (${file})`)

    const match = allPrograms.find(p => {
      const n = typeof p.name === "object" ? (p.name.es || "") : (p.name || "")
      return n === programName
    })

    if (!match) {
      console.log(`  ⚠ Program "${programName}" not found in DB — skipping`)
      continue
    }

    const programId = match.id
    console.log(`  Found: ${programId}`)

    // Delete existing exercises
    const existingExercises = await fetchAll(
      `/api/collections/program_exercises/records?filter=(program='${programId}')`,
      authH
    )
    if (existingExercises.length > 0) {
      console.log(`  🗑  Deleting ${existingExercises.length} existing exercises...`)
      for (const ex of existingExercises) {
        await api(`/api/collections/program_exercises/records/${ex.id}`, {
          method: "DELETE", headers: authH,
        })
      }
    }

    // Delete existing phases
    const existingPhases = await fetchAll(
      `/api/collections/program_phases/records?filter=(program='${programId}')`,
      authH
    )
    if (existingPhases.length > 0) {
      console.log(`  🗑  Deleting ${existingPhases.length} existing phases...`)
      for (const ph of existingPhases) {
        await api(`/api/collections/program_phases/records/${ph.id}`, {
          method: "DELETE", headers: authH,
        })
      }
    }

    // Create phases + exercises
    let totalExercises = 0
    for (const phase of data.phases) {
      console.log(`  📁 Phase ${phase.phase_number}: ${phase.name}`)
      await api("/api/collections/program_phases/records", {
        method: "POST", headers: authH,
        body: JSON.stringify({
          program: programId,
          phase_number: phase.phase_number,
          name: i18n(phase.name),
          weeks: phase.weeks,
          color: phase.color || "",
          sort_order: phase.phase_number,
        }),
      })

      for (const day of phase.days) {
        for (const ex of day.exercises) {
          await api("/api/collections/program_exercises/records", {
            method: "POST", headers: authH,
            body: JSON.stringify({
              program: programId,
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
              section: ex.priority === "warmup" ? "warmup" : ex.priority === "cooldown" ? "cooldown" : "main",
            }),
          })
          totalExercises++
        }
      }
    }
    console.log(`  ✅ ${data.phases.length} phases, ${totalExercises} exercises uploaded`)
    successCount++
  }

  console.log(`\n🎉 Done! ${successCount}/${files.length} programs updated.`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
