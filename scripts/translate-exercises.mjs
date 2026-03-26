#!/usr/bin/env node
/**
 * Report exercises missing English translations.
 *
 * Reads src/data/exercise-catalog.json and checks translatable fields
 * (name, muscles, note, description) for missing "en" keys.
 *
 * Usage: node scripts/translate-exercises.mjs
 */

import { readFileSync } from 'fs'

const TRANSLATABLE_FIELDS = ['name', 'muscles', 'note', 'description']

const raw = readFileSync('src/data/exercise-catalog.json', 'utf8')
const catalog = JSON.parse(raw)

let totalExercises = 0
let missingCount = 0
const missing = []

for (const [, catData] of Object.entries(catalog.categories || {})) {
  for (const ex of catData.exercises || []) {
    totalExercises++
    const missingFields = []

    for (const field of TRANSLATABLE_FIELDS) {
      const value = ex[field]
      if (!value) continue // empty field — nothing to translate
      if (typeof value === 'string') {
        // Legacy plain string — needs wrapping + EN translation
        missingFields.push(field)
      } else if (typeof value === 'object' && !value.en) {
        // JSON object without EN key
        missingFields.push(field)
      }
    }

    if (missingFields.length > 0) {
      missingCount++
      const nameStr = typeof ex.name === 'object' ? (ex.name.es || ex.name.en) : ex.name
      missing.push({ id: ex.id, name: nameStr, fields: missingFields })
    }
  }
}

console.log(`Exercise catalog translation report`)
console.log(`${'─'.repeat(50)}`)
console.log(`Total exercises: ${totalExercises}`)
console.log(`Missing EN translations: ${missingCount}`)
console.log()

if (missing.length === 0) {
  console.log('All exercises have EN translations!')
} else {
  console.log('Exercises needing EN translation:')
  console.log()
  for (const { id, name, fields } of missing) {
    console.log(`  ${id}`)
    console.log(`    name: ${name}`)
    console.log(`    missing: ${fields.join(', ')}`)
  }
}
