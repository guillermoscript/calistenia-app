/**
 * program-catalog.test.mjs — Las etiquetas del catálogo oficial (#713).
 *
 * Dos mitades:
 *
 * 1. PURA. `SKELETONS` contra los vocabularios que la app entiende y contra el
 *    «PARA TI» REAL (`matchUserToPrograms` con los 15 programas de verdad, no
 *    con el fixture de 13 de `matchPrograms.test.ts`). Es lo que garantiza que
 *    un usuario que marcó «codo» en el onboarding recibe el Pull-up Roadmap
 *    con `health_flag`, y que cada nivel × objetivo tiene programa.
 *
 * 2. INTEGRACIÓN (con binario de PocketBase, como `reseed-program.test.mjs`).
 *    La migración de datos `1788881000_relabel_official_programs.js` se aplica
 *    sobre una base cuyas 15 filas oficiales llevan los valores VIEJOS (los de
 *    producción antes de #713), y se comprueba que las deja como `SKELETONS`,
 *    que una segunda pasada no toca nada y que una copia de usuario ni se mira.
 *    Un stub de `pb` no prueba una migración (lección de #601).
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CONTRAINDICATION_VOCABULARY, EQUIPMENT_VOCABULARY, SKELETONS } from './lib/program-catalog.mjs'
import { INJURY_IDS } from '../packages/core/types/onboarding.ts'
import { matchUserToPrograms } from '../packages/core/lib/matchPrograms.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const REPO_MIGRATIONS = resolve(ROOT, 'pb_migrations')
const RELABEL_MIGRATION = '1788881000_relabel_official_programs.js'

const PB_BINARY = process.env.PB_BINARY || resolve(ROOT, 'pocketbase')
const HAS_PB = existsSync(PB_BINARY)

/** El catálogo como lo ve `matchPrograms.ts` (id = slug para leer los asertos). */
const CATALOG = SKELETONS.map(s => ({
  id: s.slug,
  name: s.name.en,
  description: s.description.en,
  duration_weeks: s.duration_weeks,
  difficulty: s.difficulty,
  goal_type: s.goal_type,
  skill: s.skill,
  intensity: s.intensity,
  days_per_week: s.days_per_week,
  equipment_required: s.equipment_required,
  contraindications: s.contraindications,
}))

const SIX_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// ─── 1. Vocabulario y cobertura ──────────────────────────────────────────────

describe('vocabulario de las etiquetas', () => {
  it('CONTRAINDICATION_VOCABULARY es INJURY_IDS sin «other»', () => {
    expect([...CONTRAINDICATION_VOCABULARY].sort()).toEqual(INJURY_IDS.filter(i => i !== 'other').sort())
  })

  it.each(SKELETONS.map(s => [s.slug, s]))('%s declara solo valores que el onboarding puede cruzar', (_slug, s) => {
    for (const c of s.contraindications) expect(CONTRAINDICATION_VOCABULARY).toContain(c)
    for (const e of s.equipment_required) expect(EQUIPMENT_VOCABULARY).toContain(e)
    expect(new Set(s.contraindications).size).toBe(s.contraindications.length)
    expect(new Set(s.equipment_required).size).toBe(s.equipment_required.length)
  })

  it('solo Fundamentos puede ir sin contraindicaciones: el resto cuelga, invierte, salta o hace nordic', () => {
    const vacios = SKELETONS.filter(s => s.contraindications.length === 0).map(s => s.slug)
    expect(vacios).toEqual(['principiante-fundamentos'])
  })

  it('cada nivel × objetivo tiene programa (intermedio + maintain es «Balance Total», fuera del catálogo)', () => {
    for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
      for (const goal of ['fat_loss', 'muscle_gain', 'maintain']) {
        const hits = SKELETONS.filter(s => s.difficulty === difficulty && s.goal_type === goal)
        if (difficulty === 'intermediate' && goal === 'maintain') {
          expect(hits, 'esa celda la ocupa Balance Total').toHaveLength(0)
        } else {
          expect(hits.length, `${difficulty} × ${goal} sin programa`).toBeGreaterThan(0)
        }
      }
    }
    const skills = SKELETONS.filter(s => s.goal_type === 'skill').map(s => s.skill).sort()
    expect(skills).toEqual(['handstand', 'muscle_up', 'planche', 'pull_up'])
  })

  it('un programa que exige lastre lo declara', () => {
    expect(SKELETONS.find(s => s.slug === 'avanzado-fuerza-total').equipment_required).toContain('weight')
  })
})

// ─── 2. El «PARA TI» con el catálogo real ────────────────────────────────────

describe('matchUserToPrograms con los 15 programas reales', () => {
  it('principiante con codo tocado: el Pull-up Roadmap sale de secundario, pero con health_flag', () => {
    const r = matchUserToPrograms(
      { level: 'principiante', primary_goal: 'ganar_musculo', focus_areas: ['pull_up'], training_days: SIX_DAYS, injuries: ['elbow'] },
      CATALOG,
    )
    expect(r.primary?.id).toBe('principiante-ganar-musculo')
    expect(r.secondary?.id).toBe('pull-up-roadmap')
    expect(r.penalties.get('pull-up-roadmap')).toContain('health_flag')
    // Y el primario también avisa: fondos profundos y excéntrico de tracción.
    expect(r.penalties.get('principiante-ganar-musculo')).toContain('health_flag')
  })

  it('muñeca tocada: todos los programas con apoyo invertido de manos quedan marcados', () => {
    const r = matchUserToPrograms(
      { level: 'avanzado', primary_goal: 'perder_grasa', focus_areas: ['handstand'], training_days: SIX_DAYS, injuries: ['wrist'] },
      CATALOG,
    )
    expect(r.primary?.id).toBe('avanzado-cutting')
    expect(r.secondary?.id).toBe('handstand-roadmap')
    for (const slug of ['avanzado-cutting', 'handstand-roadmap', 'planche-roadmap', 'avanzado-fuerza-total', 'avanzado-volumen', 'intermedio-definicion']) {
      expect(r.penalties.get(slug), slug).toContain('health_flag')
    }
  })

  it('rodilla tocada: los programas con nordic o salto avisan, y Fundamentos no', () => {
    const r = matchUserToPrograms(
      { level: 'principiante', primary_goal: 'recomposicion', focus_areas: [], training_days: SIX_DAYS, injuries: ['knee'] },
      CATALOG,
    )
    expect(r.primary?.id).toBe('principiante-fundamentos')
    expect(r.penalties.get('principiante-fundamentos')).toBeUndefined()
    for (const slug of ['principiante-quema-grasa', 'mujer-gluteo-tonificacion', 'avanzado-volumen', 'intermedio-hipertrofia']) {
      expect(r.penalties.get(slug), slug).toContain('health_flag')
    }
  })

  it('sin lesiones y con seis días: ningún programa lleva health_flag', () => {
    const r = matchUserToPrograms(
      { level: 'intermedio', primary_goal: 'ganar_musculo', focus_areas: ['muscle_up'], training_days: SIX_DAYS, injuries: [] },
      CATALOG,
    )
    expect(r.primary?.id).toBe('intermedio-hipertrofia')
    expect(r.secondary?.id).toBe('muscle-up-roadmap')
    for (const [slug, pen] of r.penalties) expect(pen, slug).not.toContain('health_flag')
  })
})

// ─── 3. La migración de datos contra PocketBase real ─────────────────────────

/** Valores de producción ANTES de #713 (el `SKELETONS` de `acb0f7c4`). */
const OLD_LABELS = {
  'principiante-quema-grasa':   ['fat_loss',    'light',    [],                                    []],
  'principiante-ganar-musculo': ['muscle_gain', 'moderate', ['pull_bar'],                          []],
  'principiante-fundamentos':   ['maintain',    'light',    [],                                    []],
  'intermedio-definicion':      ['fat_loss',    'intense',  ['pull_bar', 'parallel_bars'],         []],
  'intermedio-hipertrofia':     ['muscle_gain', 'moderate', ['pull_bar', 'parallel_bars'],         []],
  'avanzado-cutting':           ['fat_loss',    'intense',  ['pull_bar', 'parallel_bars', 'bands'], []],
  'avanzado-volumen':           ['muscle_gain', 'intense',  ['pull_bar', 'parallel_bars', 'bands'], []],
  'avanzado-fuerza-total':      ['maintain',    'intense',  ['pull_bar', 'parallel_bars', 'bands'], []],
  'pull-up-roadmap':            ['skill',       'light',    ['pull_bar', 'bands'],                 []],
  'handstand-roadmap':          ['skill',       'moderate', ['bands'],                             ['wrist', 'shoulder']],
  'muscle-up-roadmap':          ['skill',       'intense',  ['pull_bar', 'parallel_bars', 'bands', 'weight'], ['elbow', 'shoulder']],
  'planche-roadmap':            ['skill',       'intense',  ['parallel_bars', 'pull_bar', 'bands', 'weight'], ['wrist', 'shoulder', 'elbow']],
  'mujer-gluteo-tonificacion':  ['fat_loss',    'moderate', ['bands'],                             []],
  'mujer-full-body-toning':     ['maintain',    'light',    [],                                    []],
  'mujer-fuerza-funcional':     ['muscle_gain', 'moderate', ['pull_bar', 'bands', 'parallel_bars'], []],
}

function migrateUp(dataDir, migrationsDir) {
  const r = spawnSync(PB_BINARY, ['migrate', 'up', '--dir', dataDir, '--migrationsDir', migrationsDir], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`pocketbase migrate up falló (código ${r.status}):\n${r.stdout}\n${r.stderr}`)
  return r.stdout + r.stderr
}

function sqlQuery(db, query) {
  const r = spawnSync('sqlite3', ['-batch', '-json', db, query], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`sqlite3 falló:\n${query}\n${r.stderr || r.stdout}`)
  return r.stdout.trim() ? JSON.parse(r.stdout) : []
}

function sqlExec(db, statements) {
  const r = spawnSync('sqlite3', ['-batch', db, statements], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`sqlite3 falló:\n${statements}\n${r.stderr || r.stdout}`)
}

function readLabels(db, where) {
  return Object.fromEntries(
    sqlQuery(db, `SELECT slug, goal_type, intensity, equipment_required, contraindications FROM programs WHERE ${where} ORDER BY slug`)
      .map(r => [r.slug, {
        goal_type: r.goal_type,
        intensity: r.intensity,
        equipment_required: JSON.parse(r.equipment_required || '[]'),
        contraindications: JSON.parse(r.contraindications || '[]'),
      }]),
  )
}

const sqlStr = v => `'${String(v).replace(/'/g, "''")}'`

describe.runIf(!HAS_PB && !!process.env.CI)('el binario de PocketBase en CI', () => {
  it('existe donde apunta PB_BINARY', () => {
    expect(HAS_PB, `No hay binario de PocketBase en "${PB_BINARY}"; el paso debe correr con PB_BINARY=/tmp/pb/pocketbase.`).toBe(true)
  })
})

if (!HAS_PB && !process.env.CI) {
  process.stderr.write(
    `\n[program-catalog.test] Sin binario de PocketBase en "${PB_BINARY}": se salta el test de la migración de datos.\n\n`,
  )
}

describe.skipIf(!HAS_PB)('1788881000_relabel_official_programs sobre PocketBase real', () => {
  const s = {}

  beforeAll(() => {
    s.tmp = mkdtempSync(join(tmpdir(), 'relabel-713-'))
    s.dataDir = join(s.tmp, 'pb_data')
    s.db = join(s.dataDir, 'data.db')
    s.migDir = join(s.tmp, 'pb_migrations')
    mkdirSync(s.dataDir, { recursive: true })
    mkdirSync(s.migDir, { recursive: true })

    // 1 ── Todas las migraciones del repo MENOS la de #713: esquema + siembra.
    for (const f of readdirSync(REPO_MIGRATIONS)) {
      if (f === RELABEL_MIGRATION) continue
      cpSync(join(REPO_MIGRATIONS, f), join(s.migDir, f))
    }
    migrateUp(s.dataDir, s.migDir)

    // 2 ── Las 15 filas oficiales con los valores de producción antes de #713.
    const updates = Object.entries(OLD_LABELS).map(([slug, [goal, intensity, eq, contra]]) =>
      `UPDATE programs SET goal_type = ${sqlStr(goal)}, intensity = ${sqlStr(intensity)}, ` +
      `equipment_required = ${sqlStr(JSON.stringify(eq))}, contraindications = ${sqlStr(JSON.stringify(contra))} ` +
      `WHERE is_official = 1 AND slug = ${sqlStr(slug)};`,
    )
    sqlExec(s.db, updates.join('\n'))
    s.antes = readLabels(s.db, 'is_official = 1 AND slug != \'\'')

    // 3 ── Una copia de usuario del Pull-up Roadmap (slug vacío, no oficial):
    //      la migración no la puede tocar aunque lleve el nombre del oficial.
    const cols = sqlQuery(s.db, 'PRAGMA table_info(programs)').map(c => c.name)
    s.copyId = 'copia713_' + Date.now().toString(36)
    const select = cols.map(c => {
      if (c === 'id') return sqlStr(s.copyId)
      if (c === 'is_official' || c === 'is_featured') return '0'
      if (c === 'slug' || c === 'content_hash') return "''"
      return `\`${c}\``
    }).join(', ')
    sqlExec(s.db, `INSERT INTO programs (${cols.map(c => `\`${c}\``).join(', ')}) SELECT ${select} FROM programs WHERE slug = 'pull-up-roadmap' AND is_official = 1;`)
    s.copiaAntes = sqlQuery(s.db, `SELECT * FROM programs WHERE id = ${sqlStr(s.copyId)}`)

    // 4 ── Primera pasada: la migración de #713.
    cpSync(join(REPO_MIGRATIONS, RELABEL_MIGRATION), join(s.migDir, RELABEL_MIGRATION))
    s.salida1 = migrateUp(s.dataDir, s.migDir)
    s.despues = readLabels(s.db, 'is_official = 1 AND slug != \'\'')
    s.copiaDespues = sqlQuery(s.db, `SELECT * FROM programs WHERE id = ${sqlStr(s.copyId)}`)

    // 5 ── Segunda pasada: el mismo cuerpo bajo otro timestamp.
    const again = '1788881001_relabel_again.js'
    writeFileSync(join(s.migDir, again), readFileSync(join(REPO_MIGRATIONS, RELABEL_MIGRATION), 'utf8'), 'utf8')
    s.salida2 = migrateUp(s.dataDir, s.migDir)
    s.despues2 = readLabels(s.db, 'is_official = 1 AND slug != \'\'')
  }, 300_000)

  afterAll(() => {
    if (s.tmp) rmSync(s.tmp, { recursive: true, force: true })
  })

  it('el escenario partía de los valores viejos (12 de 15 distintos de SKELETONS)', () => {
    expect(Object.keys(s.antes)).toHaveLength(15)
    const distintos = SKELETONS.filter(sk => JSON.stringify(s.antes[sk.slug]) !== JSON.stringify(expected(sk)))
    expect(distintos.map(d => d.slug)).toHaveLength(12)
  })

  it('deja las 15 filas oficiales exactamente como SKELETONS', () => {
    for (const sk of SKELETONS) expect(s.despues[sk.slug], sk.slug).toEqual(expected(sk))
  })

  it('cuenta en el log las filas que cambió', () => {
    expect(s.salida1).toMatch(/\[relabel_official_programs\] 12 filas reetiquetadas de 15/)
  })

  it('la segunda pasada no toca nada', () => {
    expect(s.salida2).toMatch(/\[relabel_official_programs\] 0 filas reetiquetadas de 15/)
    expect(s.despues2).toEqual(s.despues)
  })

  it('la copia de usuario queda intacta, columna por columna', () => {
    expect(s.copiaDespues).toEqual(s.copiaAntes)
    expect(s.copiaDespues[0].contraindications).toBe('[]')
  })
})

function expected(sk) {
  return {
    goal_type: sk.goal_type,
    intensity: sk.intensity,
    equipment_required: sk.equipment_required,
    contraindications: sk.contraindications,
  }
}
