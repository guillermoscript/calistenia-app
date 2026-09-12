import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRIORITY_COLORS } from './style-tokens'
import type { Priority } from '../types'
import {
  DEFAULT_PRIORITY,
  DEFAULT_SECTION,
  PRIORITIES,
  PRIORITY_ALIASES,
  normalizePriority,
  resolveSection,
} from '../../../scripts/lib/program-exercise-fields.mjs'

/**
 * Issue #607: durante meses `PRIORITY_COLORS` conoció `high|med|low` mientras los
 * seeders escribían `primary|secondary|accessory`, así que el 99 % de las filas de
 * `program_exercises` caía al color de fallback y nadie se enteró.
 *
 * Este test existe para que esa deriva no vuelva a ser silenciosa: importa el
 * helper que usan los seeders y los propios JSON de `programs/`, y falla si
 * aparece un valor de prioridad que la app no sabe pintar.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROGRAMS_DIR = resolve(__dirname, '../../../programs')

/** Las tres claves del tipo `Priority`, escritas a mano para no leerlas del propio objeto. */
const EXPECTED_PRIORITIES: Priority[] = ['high', 'med', 'low']

/** Todos los `priority` que aparecen en los JSON de programas del repo. */
function priorityValuesInPrograms(): string[] {
  const found = new Set<string>()
  for (const file of readdirSync(PROGRAMS_DIR).filter(f => f.endsWith('.json'))) {
    const raw = readFileSync(resolve(PROGRAMS_DIR, file), 'utf-8')
    for (const match of raw.matchAll(/"priority"\s*:\s*"([^"]*)"/g)) found.add(match[1])
  }
  return [...found].sort()
}

describe('PRIORITY_COLORS', () => {
  it('cubre exactamente el enum Priority, ni una clave más ni una menos', () => {
    expect(Object.keys(PRIORITY_COLORS).sort()).toEqual([...EXPECTED_PRIORITIES].sort())
  })

  it('da los cuatro tokens de estilo a cada prioridad', () => {
    for (const priority of EXPECTED_PRIORITIES) {
      const tokens = PRIORITY_COLORS[priority]
      expect(tokens, priority).toBeDefined()
      for (const slot of ['stripe', 'border', 'text', 'badge'] as const) {
        expect(tokens[slot], `${priority}.${slot}`).toBeTruthy()
      }
    }
  })

  it('usa un color distinto por prioridad (si no, el badge no informa de nada)', () => {
    const stripes = EXPECTED_PRIORITIES.map(p => PRIORITY_COLORS[p].stripe)
    expect(new Set(stripes).size).toBe(EXPECTED_PRIORITIES.length)
  })
})

describe('PRIORITY_COLORS vs. el seeder', () => {
  it('el enum del helper del seeder es el mismo que el del tipo', () => {
    expect([...PRIORITIES].sort()).toEqual([...EXPECTED_PRIORITIES].sort())
  })

  it('todo alias del seeder acaba en una prioridad que sabemos pintar', () => {
    for (const alias of Object.keys(PRIORITY_ALIASES)) {
      const normalized = normalizePriority(alias)
      expect(PRIORITY_COLORS[normalized], `alias "${alias}" → "${normalized}"`).toBeDefined()
    }
  })

  it('la prioridad por defecto tiene color', () => {
    expect(PRIORITY_COLORS[DEFAULT_PRIORITY]).toBeDefined()
  })

  it('todo priority de los JSON de programs/ se puede pintar', () => {
    const values = priorityValuesInPrograms()
    // Guarda contra un glob vacío: si `programs/` se mueve, el test pasaría en falso.
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      const normalized = normalizePriority(value, 'programs/*.json')
      expect(PRIORITY_COLORS[normalized], `"${value}" → "${normalized}"`).toBeDefined()
    }
  })
})

describe('normalizePriority', () => {
  it('traduce el vocabulario viejo del JSON', () => {
    expect(normalizePriority('primary')).toBe('high')
    expect(normalizePriority('secondary')).toBe('med')
    expect(normalizePriority('accessory')).toBe('low')
  })

  it('deja pasar los valores que ya son del enum', () => {
    for (const priority of EXPECTED_PRIORITIES) {
      expect(normalizePriority(priority)).toBe(priority)
    }
  })

  it('trata warmup/cooldown como marcadores de sección, no como prioridades', () => {
    expect(normalizePriority('warmup')).toBe(DEFAULT_PRIORITY)
    expect(normalizePriority('cooldown')).toBe(DEFAULT_PRIORITY)
  })

  it('normaliza espacios y mayúsculas', () => {
    expect(normalizePriority('  PRIMARY ')).toBe('high')
  })

  it('usa el valor por defecto cuando no viene nada', () => {
    expect(normalizePriority(undefined)).toBe(DEFAULT_PRIORITY)
    expect(normalizePriority(null)).toBe(DEFAULT_PRIORITY)
    expect(normalizePriority('')).toBe(DEFAULT_PRIORITY)
  })

  it('revienta ante un valor fuera del enum en vez de escribirlo', () => {
    expect(() => normalizePriority('alta')).toThrow(/fuera del enum/)
    expect(() => normalizePriority('urgent')).toThrow(/fuera del enum/)
  })

  it('nombra el ejercicio en el error para poder encontrarlo en el JSON', () => {
    expect(() => normalizePriority('alta', 'Dominadas pronadas')).toThrow(/Dominadas pronadas/)
  })
})

describe('resolveSection', () => {
  it('respeta la sección explícita', () => {
    expect(resolveSection({ section: 'cooldown', priority: 'primary' })).toBe('cooldown')
  })

  it('deduce la sección del priority cuando el JSON lo usa de marcador', () => {
    expect(resolveSection({ priority: 'warmup' })).toBe('warmup')
    expect(resolveSection({ priority: 'cooldown' })).toBe('cooldown')
  })

  it('cae en main para el trabajo principal', () => {
    expect(resolveSection({ priority: 'primary' })).toBe(DEFAULT_SECTION)
    expect(resolveSection({})).toBe(DEFAULT_SECTION)
  })
})
