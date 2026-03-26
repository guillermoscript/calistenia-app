#!/usr/bin/env node
/**
 * Compares translation keys between locale files.
 * Reports missing keys in either direction.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(__dirname, '../src/locales')

const es = JSON.parse(readFileSync(resolve(localesDir, 'es/translation.json'), 'utf-8'))
const en = JSON.parse(readFileSync(resolve(localesDir, 'en/translation.json'), 'utf-8'))

const esKeys = new Set(Object.keys(es))
const enKeys = new Set(Object.keys(en))

const missingInEn = [...esKeys].filter(k => !enKeys.has(k))
const missingInEs = [...enKeys].filter(k => !esKeys.has(k))

let exitCode = 0

if (missingInEn.length) {
  console.error(`\n❌ Missing in EN (${missingInEn.length}):`)
  missingInEn.forEach(k => console.error(`  - ${k}`))
  exitCode = 1
}

if (missingInEs.length) {
  console.error(`\n❌ Missing in ES (${missingInEs.length}):`)
  missingInEs.forEach(k => console.error(`  - ${k}`))
  exitCode = 1
}

if (exitCode === 0) {
  console.log(`✅ All ${esKeys.size} keys present in both locales.`)
}

process.exit(exitCode)
