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
import { buildPayload, loadPrograms } from './generate-program-seed-migration.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const REPO_MIGRATIONS = resolve(ROOT, 'pb_migrations')
const RELABEL_MIGRATION = '1788881000_relabel_official_programs.js'
const FOR_WOMEN_MIGRATION = '1789300000_programs_for_women_sort_order.js'

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
  is_official: true,
  for_women: s.for_women,
  sort_order: s.sort_order,
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

  it('cada nivel × objetivo tiene programa (intermedio + maintain es «Balance Total», desde #740 dentro del catálogo)', () => {
    for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
      for (const goal of ['fat_loss', 'muscle_gain', 'maintain']) {
        const hits = SKELETONS.filter(s => s.difficulty === difficulty && s.goal_type === goal)
        expect(hits.length, `${difficulty} × ${goal} sin programa`).toBeGreaterThan(0)
      }
    }
    expect(SKELETONS.filter(s => s.difficulty === 'intermediate' && s.goal_type === 'maintain').map(s => s.slug))
      .toEqual(['intermedio-balance-total'])
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

  // «Intermedio – Balance Total» (#740) es el 16.º de SKELETONS pero NO está en
  // la tabla de esta migración (1788881000): su etiquetado lo hace 1789300000 y
  // su resiembra, así que aquí se mira solo a los 15 que sí relabela.
  const RELABELED = () => SKELETONS.filter(sk => sk.slug !== 'intermedio-balance-total')

  it('el escenario partía de los valores viejos (12 de 15 distintos de SKELETONS)', () => {
    expect(RELABELED()).toHaveLength(15)
    const distintos = RELABELED().filter(sk => JSON.stringify(s.antes[sk.slug]) !== JSON.stringify(expected(sk)))
    expect(distintos.map(d => d.slug)).toHaveLength(12)
  })

  it('deja las 15 filas oficiales exactamente como SKELETONS', () => {
    for (const sk of RELABELED()) expect(s.despues[sk.slug], sk.slug).toEqual(expected(sk))
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

// ─── 3. #717: variantes «Mujer ·», sexo y desempate con el catálogo real ─────

const LEVELS_717 = ['principiante', 'intermedio', 'avanzado']
const GOALS_717 = ['perder_grasa', 'ganar_musculo', 'mantener']

describe('etiquetas de #717 en SKELETONS', () => {
  it('for_women marca exactamente los tres «Mujer ·»', () => {
    expect(SKELETONS.filter(s => s.for_women).map(s => s.slug).sort()).toEqual([
      'mujer-fuerza-funcional', 'mujer-full-body-toning', 'mujer-gluteo-tonificacion',
    ])
    for (const s of SKELETONS) expect(typeof s.for_women, s.slug).toBe('boolean')
  })

  it('sort_order es entero positivo y único', () => {
    const orders = SKELETONS.map(s => s.sort_order)
    for (const o of orders) expect(Number.isInteger(o) && o > 0).toBe(true)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('cada celda con variante «Mujer ·» tiene también un genérico', () => {
    for (const w of SKELETONS.filter(s => s.for_women)) {
      const generic = SKELETONS.filter(s => !s.for_women && s.difficulty === w.difficulty && s.goal_type === w.goal_type)
      expect(generic, w.slug).toHaveLength(1)
    }
  })
})

describe('«PARA TI» con los 16 reales y el sexo (#717)', () => {
  it.each([
    ['principiante', 'ganar_musculo', 'mujer-gluteo-tonificacion', 'principiante-ganar-musculo'],
    ['principiante', 'mantener', 'mujer-full-body-toning', 'principiante-fundamentos'],
    ['intermedio', 'ganar_musculo', 'mujer-fuerza-funcional', 'intermedio-hipertrofia'],
  ])('%s + %s: usuaria → %s, el resto → %s', (level, primary_goal, women, generic) => {
    expect(matchUserToPrograms({ level, primary_goal, sex: 'female', training_days: SIX_DAYS }, CATALOG).primary?.id).toBe(women)
    expect(matchUserToPrograms({ level, primary_goal, sex: 'male', training_days: SIX_DAYS }, CATALOG).primary?.id).toBe(generic)
    expect(matchUserToPrograms({ level, primary_goal, training_days: SIX_DAYS }, CATALOG).primary?.id).toBe(generic)
  })

  it('usuaria en celda sin variante recibe el genérico (principiante + perder grasa → Quema Grasa)', () => {
    expect(matchUserToPrograms({ level: 'principiante', primary_goal: 'perder_grasa', sex: 'female' }, CATALOG).primary?.id).toBe('principiante-quema-grasa')
  })

  it('todas las celdas tienen primary (intermedio + mantener es Balance Total desde #740), con cualquier orden de entrada', () => {
    const reversed = [...CATALOG].reverse()
    for (const level of LEVELS_717) {
      for (const primary_goal of GOALS_717) {
        for (const sex of ['female', 'male', undefined]) {
          const user = { level, primary_goal, sex }
          const a = matchUserToPrograms(user, CATALOG).primary?.id ?? null
          const b = matchUserToPrograms(user, reversed).primary?.id ?? null
          expect(b, `${level} × ${primary_goal} × ${sex}`).toBe(a)
          expect(a, `${level} × ${primary_goal} × ${sex}`).not.toBeNull()
          if (level === 'intermedio' && primary_goal === 'mantener') expect(a).toBe('intermedio-balance-total')
        }
      }
    }
  })
})

describe.skipIf(!HAS_PB)('1789300000_programs_for_women_sort_order sobre PocketBase real', () => {
  const s = {}
  const readFlags = db => Object.fromEntries(
    sqlQuery(db, "SELECT slug, for_women, sort_order FROM programs WHERE is_official = 1 AND slug != '' ORDER BY slug")
      .map(r => [r.slug, { for_women: Number(r.for_women), sort_order: Number(r.sort_order) }]),
  )
  const readBalance = db => sqlQuery(db,
    "SELECT slug, goal_type, intensity, days_per_week, equipment_required, contraindications, for_women, sort_order " +
    "FROM programs WHERE json_extract(name, '$.es') = 'Intermedio – Balance Total'")

  beforeAll(() => {
    s.tmp = mkdtempSync(join(tmpdir(), 'for-women-717-'))
    s.dataDir = join(s.tmp, 'pb_data')
    s.db = join(s.dataDir, 'data.db')
    s.migDir = join(s.tmp, 'pb_migrations')
    mkdirSync(s.dataDir, { recursive: true })
    mkdirSync(s.migDir, { recursive: true })

    // 1 ── Instalación limpia: esquema + siembra + todas las migraciones.
    for (const f of readdirSync(REPO_MIGRATIONS)) cpSync(join(REPO_MIGRATIONS, f), join(s.migDir, f))
    s.salida1 = migrateUp(s.dataDir, s.migDir)
    s.flags = readFlags(s.db)
    s.balanceAntes = readBalance(s.db)

    // 2 ── El preexistente de prod: «Balance Total» sin slug ni etiquetas,
    //      como lo dejó 1776600000 (su backfill nunca casó). Desde #740 la
    //      siembra crea esa fila en una instalación limpia, así que en vez de
    //      clonar una oficial se devuelve la sembrada al estado de prod de antes
    //      de #717.
    s.btId = sqlQuery(s.db, "SELECT id FROM programs WHERE json_extract(name, '$.es') = 'Intermedio – Balance Total'")[0].id
    sqlExec(s.db,
      "UPDATE programs SET slug = '', content_hash = '', goal_type = '', intensity = '', " +
      "days_per_week = 0, sort_order = 0, for_women = 0, equipment_required = '[]', " +
      `contraindications = '[]', is_official = 1, is_featured = 1 WHERE id = ${sqlStr(s.btId)};`)

    // 3 ── Segunda pasada: el mismo cuerpo bajo otro timestamp.
    const again = '1789300001_for_women_again.js'
    writeFileSync(join(s.migDir, again), readFileSync(join(REPO_MIGRATIONS, FOR_WOMEN_MIGRATION), 'utf8'), 'utf8')
    s.salida2 = migrateUp(s.dataDir, s.migDir)
    s.balanceDespues = readBalance(s.db)
    s.flags2 = readFlags(s.db)

    // 4 ── Tercera pasada: ya no hay nada que tocar.
    const third = '1789300002_for_women_third.js'
    writeFileSync(join(s.migDir, third), readFileSync(join(REPO_MIGRATIONS, FOR_WOMEN_MIGRATION), 'utf8'), 'utf8')
    s.salida3 = migrateUp(s.dataDir, s.migDir)
    s.balanceTercera = readBalance(s.db)
  }, 300_000)

  afterAll(() => {
    if (s.tmp) rmSync(s.tmp, { recursive: true, force: true })
  })

  it('crea los dos campos y etiqueta los 16 oficiales como SKELETONS (15 por su tabla, Balance Total aparte)', () => {
    expect(s.salida1).toMatch(/\[programs_for_women_sort_order\] campos añadidos: 2/)
    expect(s.salida1).toMatch(/\[programs_for_women_sort_order\] 15 filas etiquetadas de 15/)
    expect(Object.keys(s.flags)).toHaveLength(16)
    for (const sk of SKELETONS) {
      expect(s.flags[sk.slug], sk.slug).toEqual({ for_women: sk.for_women ? 1 : 0, sort_order: sk.sort_order })
    }
  })

  it('en una instalación limpia la siembra crea Balance Total y esta migración lo etiqueta (#740)', () => {
    expect(s.balanceAntes).toHaveLength(1)
    expect(s.salida1).toMatch(/Balance Total: 1 fila\(s\)/)
  })

  it('al preexistente le pone slug, goal_type maintain y el resto de etiquetas', () => {
    expect(s.salida2).toMatch(/Balance Total: 1 fila\(s\)/)
    expect(s.balanceDespues).toHaveLength(1)
    const bt = s.balanceDespues[0]
    expect(bt.slug).toBe('intermedio-balance-total')
    expect(bt.goal_type).toBe('maintain')
    expect(bt.intensity).toBe('moderate')
    expect(Number(bt.days_per_week)).toBe(6)
    expect(JSON.parse(bt.equipment_required)).toEqual(['pull_bar', 'parallel_bars', 'bands'])
    expect(JSON.parse(bt.contraindications)).toEqual(['lower_back'])
    expect(Number(bt.for_women)).toBe(0)
    expect(Number(bt.sort_order)).toBe(55)
  })

  it('con Balance Total etiquetado, intermedio + mantener tiene primary', () => {
    const bt = s.balanceDespues[0]
    const withBalance = [...CATALOG, {
      id: bt.slug, name: 'Intermediate – Balance Total', description: '', duration_weeks: 12,
      difficulty: 'intermediate', goal_type: bt.goal_type, intensity: bt.intensity,
      days_per_week: Number(bt.days_per_week), equipment_required: JSON.parse(bt.equipment_required),
      contraindications: JSON.parse(bt.contraindications), is_official: true,
      for_women: Number(bt.for_women) === 1, sort_order: Number(bt.sort_order),
    }]
    for (const sex of ['female', 'male', undefined]) {
      expect(matchUserToPrograms({ level: 'intermedio', primary_goal: 'mantener', sex }, withBalance).primary?.id).toBe('intermedio-balance-total')
    }
  })

  it('la segunda y la tercera pasada no tocan los 15, y la tercera tampoco a Balance Total', () => {
    expect(s.salida2).toMatch(/\[programs_for_women_sort_order\] campos añadidos: 0/)
    expect(s.salida2).toMatch(/\[programs_for_women_sort_order\] 0 filas etiquetadas de 15/)
    expect(s.flags2).toEqual(s.flags)
    expect(s.salida3).toMatch(/Balance Total: 0 fila\(s\)/)
    expect(s.balanceTercera).toEqual(s.balanceDespues)
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

// ─── 4. #761: `program.description` del JSON y la que se siembra ─────────────

const DESCRIPTION_MIGRATION = '1790740000_program_descriptions_761.js'

describe('descripción de la ficha (#761)', () => {
  const loaded = loadPrograms()

  it('lo que se siembra es SKELETONS, y el JSON de cada programa coincide con su español', () => {
    for (const item of loaded) {
      const seeded = buildPayload(item).program.description
      expect(seeded, item.file).toEqual(item.entry.description)
      expect(item.data.program.description, item.file).toBe(item.entry.description.es)
    }
  })

  it('mutación: editar program.description del JSON sin tocar el catálogo rompe la siembra y lo explica', () => {
    for (const item of loaded) {
      const data = structuredClone(item.data)
      data.program.description = item.entry.description.es + ' Necesitas una prensa de piernas.'
      expect(() => buildPayload({ ...item, data }), item.file).toThrow(/program\.description no coincide con la de SKELETONS/)
    }
  })

  it('mutación: sin program.description en el JSON se siembra la del catálogo', () => {
    for (const item of loaded) {
      const data = structuredClone(item.data)
      delete data.program.description
      expect(buildPayload({ ...item, data }).program.description, item.file).toEqual(item.entry.description)
    }
  })

  it('Glúteo + Tonificación declara el material real: banda, silla o banco, escalón y toalla', () => {
    const d = SKELETONS.find(sk => sk.slug === 'mujer-gluteo-tonificacion').description
    expect(d.es).toMatch(/banda/i)
    expect(d.es).toMatch(/silla/i)
    expect(d.es).toMatch(/escal[oó]n/i)
    expect(d.es).toMatch(/toalla/i)
    expect(d.en).toMatch(/band/i)
    expect(d.en).toMatch(/chair/i)
    expect(d.en).toMatch(/step/i)
    expect(d.en).toMatch(/towel/i)
  })
})

describe.skipIf(!HAS_PB)('1790740000_program_descriptions_761 sobre PocketBase real', () => {
  const s = {}
  const migSource = readFileSync(join(REPO_MIGRATIONS, DESCRIPTION_MIGRATION), 'utf8')
  const FIXES = JSON.parse(migSource.match(/const FIXES = (\[[\s\S]*?\n  \])/)[1])
  const read = () => Object.fromEntries(
    sqlQuery(s.db, "SELECT slug, description FROM programs WHERE is_official = 1 AND slug != ''")
      .map(r => [r.slug, JSON.parse(r.description)]),
  )

  beforeAll(() => {
    s.tmp = mkdtempSync(join(tmpdir(), 'desc-761-'))
    s.dataDir = join(s.tmp, 'pb_data')
    s.db = join(s.dataDir, 'data.db')
    s.migDir = join(s.tmp, 'pb_migrations')
    mkdirSync(s.dataDir, { recursive: true })
    mkdirSync(s.migDir, { recursive: true })
    for (const f of readdirSync(REPO_MIGRATIONS)) {
      if (f === DESCRIPTION_MIGRATION) continue
      cpSync(join(REPO_MIGRATIONS, f), join(s.migDir, f))
    }
    migrateUp(s.dataDir, s.migDir)

    // Producción antes de #761: el texto viejo del catálogo en las seis filas,
    // salvo handstand, que alguien editó a mano y no se debe pisar.
    for (const f of FIXES) {
      const desc = f.slug === 'handstand-roadmap' ? { es: 'Editado a mano', en: 'Hand edited' } : { es: f.from, en: 'old' }
      sqlExec(s.db, `UPDATE programs SET description = ${sqlStr(JSON.stringify(desc))} WHERE is_official = 1 AND slug = ${sqlStr(f.slug)};`)
    }
    s.antes = read()

    cpSync(join(REPO_MIGRATIONS, DESCRIPTION_MIGRATION), join(s.migDir, DESCRIPTION_MIGRATION))
    s.salida1 = migrateUp(s.dataDir, s.migDir)
    s.despues = read()

    writeFileSync(join(s.migDir, '1790740001_descriptions_again.js'), migSource, 'utf8')
    s.salida2 = migrateUp(s.dataDir, s.migDir)
    s.despues2 = read()
  }, 300_000)

  afterAll(() => {
    if (s.tmp) rmSync(s.tmp, { recursive: true, force: true })
  })

  it('el escenario partía del texto viejo', () => {
    expect(s.antes['mujer-gluteo-tonificacion'].es).toMatch(/Bodyweight \+ ligas/)
  })

  it('las filas con el texto viejo quedan como SKELETONS (es y en)', () => {
    for (const f of FIXES.filter(x => x.slug !== 'handstand-roadmap')) {
      expect(s.despues[f.slug], f.slug).toEqual(SKELETONS.find(sk => sk.slug === f.slug).description)
    }
  })

  it('no pisa una descripción editada a mano', () => {
    expect(s.despues['handstand-roadmap']).toEqual({ es: 'Editado a mano', en: 'Hand edited' })
    expect(s.salida1).toMatch(/5 de 6 descripciones actualizadas/)
  })

  it('las otras nueve filas no cambian', () => {
    for (const sk of SKELETONS.filter(x => !FIXES.some(f => f.slug === x.slug))) {
      expect(s.despues[sk.slug], sk.slug).toEqual(s.antes[sk.slug])
    }
  })

  it('la segunda pasada no toca nada', () => {
    expect(s.salida2).toMatch(/0 de 6 descripciones actualizadas/)
    expect(s.despues2).toEqual(s.despues)
  })
})

// ─── 5. #740: Balance Total pasa a ser un programa curado ────────────────────

const BALANCE_RESEED = '1790760000_reseed_intermedio-balance-total.js'
const BALANCE_SLUG = 'intermedio-balance-total'

describe('Balance Total curado (#740)', () => {
  const item = loadPrograms().find(p => p.entry.slug === BALANCE_SLUG)

  it('está en SKELETONS con las etiquetas que ya puso en prod 1789300000 (+ lastre y lesiones del contenido)', () => {
    const sk = SKELETONS.find(x => x.slug === BALANCE_SLUG)
    expect(sk).toMatchObject({ difficulty: 'intermediate', goal_type: 'maintain', intensity: 'moderate', days_per_week: 6, for_women: false, sort_order: 55 })
    expect(sk.name.es).toBe('Intermedio – Balance Total')
    expect(sk.equipment_required).toEqual(['pull_bar', 'parallel_bars', 'bands', 'weight'])
    expect(SKELETONS).toHaveLength(16)
  })

  it('cada ejercicio siembra un id de catálogo, con nombre y notas en es y en', () => {
    const payload = buildPayload(item)
    const catalog = JSON.parse(readFileSync(resolve(ROOT, 'packages/core/data/exercise-catalog.json'), 'utf8'))
    const ids = new Set(Object.values(catalog.categories).flatMap(c => c.exercises.map(e => e.id)))
    const rows = payload.phases.flatMap(p => p.days.flatMap(d => d.exercises))
    expect(rows).toHaveLength(90)
    for (const r of rows) {
      expect(ids.has(r.exercise_id), r.exercise_id).toBe(true)
      expect(r.exercise_name.en, r.exercise_id).toBeTruthy()
      expect(r.note.en, r.exercise_id).toBeTruthy()
      expect(r.muscles.en, r.exercise_id).toBeTruthy()
    }
    expect(payload.program.instructions.en).toBeTruthy()
  })

  it('las series no repiten sus repeticiones en `reps` (#889)', () => {
    const rows = buildPayload(item).phases.flatMap(p => p.days.flatMap(d => d.exercises))
    expect(rows.filter(r => /\d\s*[x×]\s*\d/i.test(r.reps)).map(r => r.reps)).toEqual([])
  })
})

describe.skipIf(!HAS_PB)('1790760000_reseed_intermedio-balance-total sobre PocketBase real', () => {
  const s = {}
  const program = () => sqlQuery(s.db, `SELECT * FROM programs WHERE slug = ${sqlStr(BALANCE_SLUG)}`)
  const rows = () => sqlQuery(s.db, `SELECT * FROM program_exercises WHERE program = ${sqlStr(s.btId)} ORDER BY phase_number, day_id, sort_order`)

  beforeAll(() => {
    s.tmp = mkdtempSync(join(tmpdir(), 'balance-740-'))
    s.dataDir = join(s.tmp, 'pb_data')
    s.db = join(s.dataDir, 'data.db')
    s.migDir = join(s.tmp, 'pb_migrations')
    mkdirSync(s.dataDir, { recursive: true })
    mkdirSync(s.migDir, { recursive: true })

    // 1 ── Instalación con todo MENOS la resiembra de #740.
    for (const f of readdirSync(REPO_MIGRATIONS)) {
      if (f === BALANCE_RESEED) continue
      cpSync(join(REPO_MIGRATIONS, f), join(s.migDir, f))
    }
    migrateUp(s.dataDir, s.migDir)
    s.btId = program()[0].id

    // 2 ── La fila de prod: la de abril. Ids de hueco (`lun_1_1`), sin filas en
    //      `program_day_config`, destacada, sin `en` en el nombre ni hash, y con
    //      una inscripción activa encima.
    sqlExec(s.db, [
      `UPDATE program_exercises SET exercise_id = day_id || '_' || phase_number || '_' || sort_order, day_type = '' WHERE program = ${sqlStr(s.btId)};`,
      `DELETE FROM program_day_config WHERE program = ${sqlStr(s.btId)};`,
      `UPDATE programs SET is_featured = 1, content_hash = '', name = ${sqlStr(JSON.stringify({ es: 'Intermedio – Balance Total' }))}, ` +
        `equipment_required = '["pull_bar","parallel_bars","bands"]', contraindications = '["lower_back"]' WHERE id = ${sqlStr(s.btId)};`,
      `INSERT INTO user_programs (id, user, program, is_current, status, started_at, ended_at, current_phase, auto_progress) ` +
        `VALUES ('enr740balance01', 'user740balance1', ${sqlStr(s.btId)}, 1, 'active', '2026-09-01 00:00:00.000Z', '', 1, 0);`,
    ].join('\n'))
    s.antes = rows()
    s.programaAntes = program()[0]

    // 3 ── Primera pasada: la resiembra del repo.
    cpSync(join(REPO_MIGRATIONS, BALANCE_RESEED), join(s.migDir, BALANCE_RESEED))
    s.salida1 = migrateUp(s.dataDir, s.migDir)
    s.despues = rows()
    s.programaDespues = program()[0]

    // 4 ── Segunda pasada: el mismo cuerpo bajo otro timestamp.
    writeFileSync(join(s.migDir, '1790760001_balance_again.js'), readFileSync(join(REPO_MIGRATIONS, BALANCE_RESEED), 'utf8'), 'utf8')
    s.salida2 = migrateUp(s.dataDir, s.migDir)
    s.despues2 = rows()
  }, 300_000)

  afterAll(() => {
    if (s.tmp) rmSync(s.tmp, { recursive: true, force: true })
  })

  it('el escenario partía de las claves de hueco y de un solo programa Balance Total', () => {
    expect(s.antes).toHaveLength(90)
    expect(s.antes.every(r => /^[a-z]{3}_\d_\d$/.test(r.exercise_id))).toBe(true)
    expect(sqlQuery(s.db, "SELECT id FROM programs WHERE json_extract(name, '$.es') = 'Intermedio – Balance Total'")).toHaveLength(1)
  })

  it('conserva el programs.id: la inscripción sigue apuntando al mismo programa', () => {
    expect(s.programaDespues.id).toBe(s.btId)
    expect(sqlQuery(s.db, "SELECT program FROM user_programs WHERE id = 'enr740balance01'")[0].program).toBe(s.btId)
    expect(s.salida1).toMatch(/\[reseed_intermedio-balance-total\] intermedio-balance-total \(.+\): 3 fases, 21 días, 90 ejercicios/)
  })

  it('los 90 ejercicios llevan ids de catálogo, con nombre en inglés, y no se pierde ninguno', () => {
    expect(s.despues).toHaveLength(90)
    expect(s.despues.some(r => /^[a-z]{3}_\d_\d$/.test(r.exercise_id))).toBe(false)
    for (const r of s.despues) expect(JSON.parse(r.exercise_name).en, r.exercise_id).toBeTruthy()
    // Mismo ejercicio en el mismo hueco: ni sets, ni reps, ni descansos cambian.
    const clave = r => `${r.phase_number}/${r.day_id}/${r.sort_order}`
    const antes = new Map(s.antes.map(r => [clave(r), r]))
    for (const r of s.despues) {
      const a = antes.get(clave(r))
      expect(a, clave(r)).toBeTruthy()
      expect([r.sets, r.reps, r.rest_seconds, r.priority, r.is_timer, r.timer_seconds])
        .toEqual([a.sets, a.reps, a.rest_seconds, a.priority, a.is_timer, a.timer_seconds])
      expect(JSON.parse(r.exercise_name).es, clave(r)).toBe(JSON.parse(a.exercise_name).es)
    }
  })

  it('crea los 21 días (con descanso del domingo) y deja las etiquetas como SKELETONS', () => {
    expect(sqlQuery(s.db, `SELECT day_id FROM program_day_config WHERE program = ${sqlStr(s.btId)}`)).toHaveLength(21)
    const sk = SKELETONS.find(x => x.slug === BALANCE_SLUG)
    const p = s.programaDespues
    expect(JSON.parse(p.name)).toEqual(sk.name)
    expect(JSON.parse(p.description)).toEqual(sk.description)
    expect(JSON.parse(p.equipment_required)).toEqual(sk.equipment_required)
    expect(JSON.parse(p.contraindications)).toEqual(sk.contraindications)
    expect(p.goal_type).toBe(sk.goal_type)
    expect(p.content_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('no toca el estado de la instalación: destacado, visibilidad, orden', () => {
    for (const c of ['is_featured', 'is_active', 'is_official', 'visibility', 'sort_order', 'for_women', 'created_by', 'cover_image']) {
      expect(s.programaDespues[c], c).toEqual(s.programaAntes[c])
    }
  })

  it('la segunda pasada es un no-op', () => {
    expect(s.salida2).toMatch(/intermedio-balance-total \(.+\): sin cambios/)
    expect(s.despues2.map(r => r.id)).toEqual(s.despues.map(r => r.id))
  })
})
