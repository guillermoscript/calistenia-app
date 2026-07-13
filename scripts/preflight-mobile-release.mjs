#!/usr/bin/env node
/**
 * preflight-mobile-release.mjs — Verifica que node_modules de apps/mobile está
 * sincronizado con su package.json antes de cortar una release nativa.
 *
 * Motivo (incidente 2026-07-14): el AAB v17 subido a Play crasheaba al abrir
 * (SIGSEGV en libhermesvm) porque se construyó con node_modules viejo
 * (expo 56 / RN 0.85) mientras package.json ya pedía expo 57 / RN 0.86 —
 * nunca se corrió `pnpm install` tras el bump de deps. Este check corta la
 * release antes de producir un build envenenado.
 *
 * Uso: node scripts/preflight-mobile-release.mjs
 * Sale con código 1 y un mensaje claro si alguna dependencia clave difiere.
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(__dirname, '../apps/mobile')
const require = createRequire(resolve(MOBILE, 'package.json'))

const declared = JSON.parse(readFileSync(resolve(MOBILE, 'package.json'), 'utf-8'))

// Deps cuyo desfase produce builds nativos rotos (runtime JS/nativo apareado).
const CRITICAL = [
  'expo',
  'react-native',
  'react',
  'react-native-reanimated',
  'react-native-worklets',
]

/** "~57.0.4" / "^1.2.3" / "1.2.3" → ¿la instalada satisface el rango declarado? */
function satisfies(installed, range) {
  const clean = range.replace(/^[~^]/, '')
  const [iMaj, iMin, iPat] = installed.split('.').map(Number)
  const [rMaj, rMin, rPat] = clean.split('.').map(Number)
  if (range.startsWith('^')) return iMaj === rMaj && (iMin > rMin || (iMin === rMin && iPat >= rPat))
  if (range.startsWith('~')) return iMaj === rMaj && iMin === rMin && iPat >= rPat
  return installed === clean
}

let failed = false
for (const dep of CRITICAL) {
  const range = declared.dependencies?.[dep] ?? declared.devDependencies?.[dep]
  if (!range) continue
  let installed
  try {
    installed = require(`${dep}/package.json`).version
  } catch {
    console.error(`✗ ${dep}: declarado ${range} pero NO está instalado`)
    failed = true
    continue
  }
  if (!satisfies(installed, range)) {
    console.error(`✗ ${dep}: instalado ${installed}, package.json pide ${range}`)
    failed = true
  } else {
    console.log(`✓ ${dep} ${installed}`)
  }
}

if (failed) {
  console.error('\nnode_modules desincronizado con package.json.')
  console.error('Corre `pnpm install` desde la raíz del repo y vuelve a intentar.')
  process.exit(1)
}
console.log('\nPreflight OK — deps nativas sincronizadas.')
