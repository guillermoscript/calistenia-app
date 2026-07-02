#!/usr/bin/env node
/**
 * One-time converter: hasaneyldrm/exercises-dataset → seeds/exercisedb/exercises.json
 *
 * Source data originates from ExerciseDB v1 by AscendAPI (https://oss.exercisedb.dev),
 * re-published with ES/IT/TR/RU/ZH instruction translations in
 * https://github.com/hasaneyldrm/exercises-dataset (media NOT redistributed —
 * each record keeps the original ExerciseDB `media_id` reference only).
 *
 * We trim to the app's two languages (es/en) and drop the redundant paragraph
 * `instructions` field (it is byte-identical to `instruction_steps` joined
 * with spaces — verified across all 1,324 records).
 *
 * Spanish exercise names are not part of the upstream dataset; they were
 * AI-translated once and passed in as a { id → nombre } JSON map.
 *
 * Usage:
 *   node scripts/prepare-exercisedb-seed.mjs <cloned-dataset-repo> <names-es.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'seeds/exercisedb')
const OUT_PATH = join(OUT_DIR, 'exercises.json')

const [datasetRepo, namesEsPath] = process.argv.slice(2)
if (!datasetRepo || !namesEsPath) {
  console.error('Usage: node scripts/prepare-exercisedb-seed.mjs <cloned-dataset-repo> <names-es.json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(join(datasetRepo, 'data/exercises.json'), 'utf8'))
const namesEs = JSON.parse(readFileSync(namesEsPath, 'utf8'))

const missing = raw.filter(x => !namesEs[x.id])
if (missing.length > 0) {
  console.error(`FATAL: ${missing.length} exercises missing Spanish names (e.g. ${missing[0].id} "${missing[0].name}")`)
  process.exit(1)
}

const exercises = raw.map(x => ({
  id: x.id,
  name: { es: namesEs[x.id], en: x.name },
  body_part: x.body_part,
  target: x.target,
  muscle_group: x.muscle_group,
  secondary_muscles: x.secondary_muscles ?? [],
  equipment: x.equipment,
  steps: {
    es: x.instruction_steps?.es ?? [],
    en: x.instruction_steps?.en ?? [],
  },
  media_id: x.media_id ?? null,
}))

// Deterministic order by upstream id
exercises.sort((a, b) => a.id.localeCompare(b.id))

const out = {
  _meta: {
    source: 'https://github.com/hasaneyldrm/exercises-dataset',
    origin: 'ExerciseDB v1 by AscendAPI (https://oss.exercisedb.dev) via Kaggle re-host by omarxadel',
    note: 'Media is NOT redistributed. media_id references the original ExerciseDB CDN asset id; check media rights before hotlinking static.exercisedb.dev. Spanish names are AI-translated (not upstream). Trimmed to es/en.',
    count: exercises.length,
  },
  exercises,
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_PATH, JSON.stringify(out, null, 1))
console.log(`Wrote ${OUT_PATH} (${exercises.length} exercises)`)
