#!/usr/bin/env node
/**
 * extract-tempo.mjs — PROPOSAL-ONLY tempo extractor
 *
 * Scans workout note/reps free-text and seed note/reps for tempo cues,
 * producing a PROPOSAL file for human review.
 *
 * CRITICAL: This script does NOT write tempo values back into seed files.
 * Output is scripts/tempo-proposal.json — for maintainer review only.
 *
 * Usage:  node scripts/extract-tempo.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ─── Pure parser (exported for unit tests) ───────────────────────────────────

/**
 * Parse a combined note+reps text and extract structured tempo fields.
 * Returns only numerically confirmed fields — never guesses from qualitative
 * words like "lento" or "controlado" without a number.
 *
 * @param {string} text
 * @returns {{ eccentric?: number; pauseBottom?: number; concentric?: number; pauseTop?: number } | null}
 */
export function parseTempo(text) {
  if (!text || typeof text !== 'string') return null

  const t = text.toLowerCase()
  const result = {}

  // ── eccentric (lowering phase) ─────────────────────────────────────────────
  // Patterns: "baja MUY lento 5 segundos", "5s bajada", "5 (5s bajada)",
  //           "baja lento 5s", "(5s)", reps like "5 (5s bajada)"
  const eccentricPatterns = [
    /\bbaja(?:\s+muy)?\s+lento\s+(\d+(?:\.\d+)?)\s*s(?:egundos?)?\b/i,
    /\b(\d+(?:\.\d+)?)\s*s(?:egundos?)?\s+(?:bajada|bajando)\b/i,
    /\(\s*(\d+(?:\.\d+)?)\s*s\s*bajada\s*\)/i,
    /\bbaja(?:\s+\w+){0,3}\s+(\d+(?:\.\d+)?)\s*s(?:egundos?)?\b/i,
    // reps string "5 (5s)" when note has "bajada" or "lento" context nearby
    // — handled separately below
  ]

  for (const pat of eccentricPatterns) {
    const m = t.match(pat)
    if (m) {
      result.eccentric = parseFloat(m[1])
      break
    }
  }

  // Reps-string pattern "N (Xs)" where the surrounding text implies lowering
  // e.g. reps = "5 (5s bajada)" or note = "baja muy lento 5 segundos"
  if (!result.eccentric) {
    const repsBajada = t.match(/\(\s*(\d+(?:\.\d+)?)\s*s\s*bajada\s*\)/i)
    if (repsBajada) result.eccentric = parseFloat(repsBajada[1])
  }

  // ── pauseTop (pause at top) ────────────────────────────────────────────────
  // Patterns: "Pausa 1s arriba", "1s pausa arriba", "(3s arriba)",
  //           "pausa isométrica 3s arriba", "pausa ... arriba"
  const pauseTopPatterns = [
    /pausa\s+(?:isom[eé]trica\s+)?(\d+(?:\.\d+)?)\s*s(?:egundos?)?\s+arriba\b/i,
    /(\d+(?:\.\d+)?)\s*s(?:egundos?)?\s+pausa\s+arriba\b/i,
    /\(\s*(\d+(?:\.\d+)?)\s*s\s+arriba\s*\)/i,
    /pausa\b[^.]*?(\d+(?:\.\d+)?)\s*s(?:egundos?)?[^.]*?\barriba\b/i,
    // "1s pausa" in context of glute bridge etc — only if "arriba" present in text
  ]

  for (const pat of pauseTopPatterns) {
    const m = t.match(pat)
    if (m) {
      result.pauseTop = parseFloat(m[1])
      break
    }
  }

  // "Xs pausa" standalone (no "arriba") — treat as pauseTop if no "abajo/bottom"
  if (!result.pauseTop) {
    const standalonePause = t.match(/(\d+(?:\.\d+)?)\s*s\s+pausa\b/i)
    if (standalonePause && !t.includes('abajo') && !t.includes('bottom')) {
      result.pauseTop = parseFloat(standalonePause[1])
    }
  }

  // "Xs de pausa arriba" or "pausa arriba Xs"
  if (!result.pauseTop) {
    const dePausa = t.match(/(\d+(?:\.\d+)?)\s*s\s+de\s+pausa\s+arriba\b/i)
    if (dePausa) result.pauseTop = parseFloat(dePausa[1])
  }

  // ── pauseBottom (pause at bottom) ─────────────────────────────────────────
  const pauseBottomPatterns = [
    /pausa\s+(\d+(?:\.\d+)?)\s*s(?:egundos?)?\s+(?:abajo|bottom)\b/i,
    /(\d+(?:\.\d+)?)\s*s(?:egundos?)?\s+pausa\s+(?:abajo|bottom)\b/i,
    /\(\s*(\d+(?:\.\d+)?)\s*s\s+(?:abajo|bottom)\s*\)/i,
  ]

  for (const pat of pauseBottomPatterns) {
    const m = t.match(pat)
    if (m) {
      result.pauseBottom = parseFloat(m[1])
      break
    }
  }

  // ── concentric ─────────────────────────────────────────────────────────────
  // "explosivo" or "fuerte" → concentric:1 (explosive)
  // NOTE: "lento" or "controlado" WITHOUT a number → do NOT assign a value
  if (/\bexplosivo\b|\bfuerte\b/i.test(t) && !result.concentric) {
    result.concentric = 1
  }

  // Check if we found anything meaningful
  if (Object.keys(result).length === 0) return null
  return result
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function confidenceFor(text, tempo) {
  const fields = Object.keys(tempo)
  if (fields.length === 0) return 'none'
  // If all fields have explicit numbers → high
  const allNumeric = fields.every(f => f !== 'concentric' || tempo[f] !== 1)
  const hasExplosiveOnly = fields.length === 1 && tempo.concentric === 1
  if (hasExplosiveOnly) return 'low'  // qualitative, no duration
  return 'high'
}

// ─── Source loading ───────────────────────────────────────────────────────────

function loadWorkouts() {
  // Load the workouts.ts as text and extract exercise entries via regex
  // (avoids transpiling TS)
  const workoutsPath = resolve(ROOT, 'packages/core/data/workouts.ts')
  let src
  try {
    src = readFileSync(workoutsPath, 'utf8')
  } catch {
    console.warn('[extract-tempo] workouts.ts not found, skipping')
    return []
  }

  const entries = []
  // Match full exercise object literals (single-line objects)
  const objPattern = /\{\s*id:\s*"([^"]+)"[^}]*\}/g
  let m
  while ((m = objPattern.exec(src)) !== null) {
    const obj = m[0]
    const idM = obj.match(/\bid:\s*"([^"]+)"/)
    const nameM = obj.match(/\bname:\s*"([^"]+)"/)
    const repsM = obj.match(/\breps:\s*"([^"]+)"/)
    const noteM = obj.match(/\bnote:\s*"([^"]*)"/)
    if (!idM) continue
    entries.push({
      id: idM[1],
      name: nameM ? nameM[1] : idM[1],
      reps: repsM ? repsM[1] : '',
      note: noteM ? noteM[1] : '',
      source: 'workouts.ts',
    })
  }
  return entries
}

function loadSeeds() {
  const seedDir = resolve(ROOT, 'seeds/exercises')
  const seedFiles = [
    'push.json', 'pull.json', 'legs.json', 'core.json',
    'glutes-lower-back.json', 'mobility.json', 'skills.json', 'cardio.json',
  ]
  const entries = []
  for (const file of seedFiles) {
    let data
    try {
      data = JSON.parse(readFileSync(resolve(seedDir, file), 'utf8'))
    } catch { continue }

    const category = data.category || file.replace('.json', '')
    for (const sub of (data.subcategories || [])) {
      for (const ex of (sub.exercises || [])) {
        const noteEs = ex.note?.es || ''
        const noteEn = ex.note?.en || ''
        const reps = ex.default_reps || ''
        entries.push({
          id: ex.slug,
          name: ex.name?.es || ex.name?.en || ex.slug,
          reps,
          note: `${noteEs} ${noteEn}`.trim(),
          source: `seeds/${file}`,
        })
      }
    }
  }
  return entries
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const workoutEntries = loadWorkouts()
  const seedEntries = loadSeeds()
  const all = [...workoutEntries, ...seedEntries]

  const proposals = []
  let highCount = 0
  let lowCount = 0
  let skippedCount = 0

  for (const ex of all) {
    const combinedText = `${ex.reps} ${ex.note}`
    const tempo = parseTempo(combinedText)
    if (!tempo) {
      skippedCount++
      continue
    }
    const confidence = confidenceFor(combinedText, tempo)
    if (confidence === 'high') highCount++
    else lowCount++

    proposals.push({
      id: ex.id,
      name: ex.name,
      source: ex.source,
      sourceText: combinedText.trim(),
      proposedTempo: tempo,
      confidence,
    })
  }

  const output = {
    _note: 'PROPOSAL ONLY — do NOT auto-apply. Review each entry and manually add approved tempo values to seed JSON files.',
    _generated: new Date().toISOString(),
    _counts: {
      total: all.length,
      withTempo: proposals.length,
      highConfidence: highCount,
      lowConfidence: lowCount,
      skipped: skippedCount,
    },
    proposals,
  }

  const outPath = resolve(ROOT, 'scripts/tempo-proposal.json')
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n')

  console.log(`[extract-tempo] Scanned ${all.length} exercises`)
  console.log(`[extract-tempo] Proposals: ${proposals.length} (high: ${highCount}, low: ${lowCount})`)
  console.log(`[extract-tempo] Written → scripts/tempo-proposal.json`)
}

main()
