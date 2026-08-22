#!/usr/bin/env node
/**
 * Normaliza `programs/*.json` al contrato de la app (#575):
 *   - `day_id` debe ser un DayId real (`lun..dom`). Los JSON antiguos usaban `d1..d6`
 *     y `buildWeekDays` los descartaba en silencio → semana de solo sáb/dom.
 *   - cada día lleva `day_type` (push | pull | legs | full | lumbar | rest | cardio | yoga | circuit).
 *
 * Remapeo por nº de días entrenables de la fase:
 *   3 → lun, mie, vie · 4 → lun, mar, jue, vie · 5 → lun..vie · 6 → lun..sab
 *
 * Idempotente. Uso: node scripts/normalize-program-days.mjs [--check]
 * Con --check no escribe: sale 1 si algún fichero necesita cambios.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../programs')
const CHECK = process.argv.includes('--check')

export const DAY_IDS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
export const DAY_TYPES = ['push', 'pull', 'lumbar', 'legs', 'full', 'rest', 'cardio', 'yoga', 'circuit']
export const LAYOUT = {
  1: ['lun'],
  2: ['lun', 'jue'],
  3: ['lun', 'mie', 'vie'],
  4: ['lun', 'mar', 'jue', 'vie'],
  5: ['lun', 'mar', 'mie', 'jue', 'vie'],
  6: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'],
  7: DAY_IDS,
}
const DAY_NAME = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
}

/** Deduce el DayType a partir del foco del día (texto libre es/en). */
export function inferDayType(focus = '') {
  const f = focus.toLowerCase()
  const has = (...ws) => ws.some(w => f.includes(w))
  if (has('descanso', 'rest', 'recuperación activa')) return 'rest'
  if (has('cardio') && !has('piernas', 'glúteo', 'full', 'cuerpo completo')) return 'cardio'
  if (has('pierna', 'glúteo', 'tren inferior', 'legs', 'cadena posterior', 'inferior')) return 'legs'
  if (has('full body', 'cuerpo completo', 'tren superior completo', 'variedad', 'skills', 'habilidad', 'core', 'transición', 'planche + balance')) return 'full'
  if (has('jal', 'tir', 'pull', 'espalda', 'tracción', 'retracción', 'australianas', 'negativas')) return 'pull'
  if (has('empuje', 'push', 'pecho', 'planche', 'pared', 'wall', 'tren superior')) return 'push'
  return 'full'
}

/** Muta `p` in place. Devuelve true si cambió algo. Lanza si la estructura es inválida. */
export function normalizeProgram(p, label = '?') {
  let changed = false
  for (const phase of p.phases) {
    const days = phase.days
    const legacy = days.filter(d => !DAY_IDS.includes(d.day_id))
    if (legacy.length) {
      const layout = LAYOUT[days.length]
      if (!layout) throw new Error(`${label}: fase ${phase.phase_number} tiene ${days.length} días, sin layout`)
      days.forEach((d, i) => {
        const oldId = d.day_id
        d.day_id = layout[i]
        if (/^Día \d+$/i.test(d.day_name || '')) d.day_name = DAY_NAME[d.day_id]
        for (const ex of d.exercises || []) {
          if (ex.exercise_id?.startsWith(`${oldId}_`)) ex.exercise_id = ex.exercise_id.replace(`${oldId}_`, `${d.day_id}_`)
        }
      })
      changed = true
    }
    for (const d of days) {
      if (!DAY_TYPES.includes(d.day_type)) {
        let type = inferDayType(d.day_focus)
        // Un día con ejercicios se entrena aunque el foco diga «recuperación activa».
        if (type === 'rest' && d.exercises?.length) type = 'full'
        d.day_type = type
        changed = true
      }
    }
    const ids = days.map(d => d.day_id)
    if (new Set(ids).size !== ids.length) throw new Error(`${label}: fase ${phase.phase_number} day_id duplicado ${ids}`)
  }
  return changed
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let dirty = 0
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.json')).sort()) {
    const path = resolve(DIR, f)
    const p = JSON.parse(readFileSync(path, 'utf8'))
    const changed = normalizeProgram(p, f)
    if (changed) {
      dirty++
      if (CHECK) console.log(`✗ ${f} necesita normalizar`)
      else { writeFileSync(path, JSON.stringify(p, null, 2) + '\n'); console.log(`✓ ${f}`) }
    }
  }
  if (CHECK && dirty) process.exit(1)
  console.log(CHECK ? `OK: ${dirty} ficheros pendientes` : `normalizados ${dirty} ficheros`)
}
