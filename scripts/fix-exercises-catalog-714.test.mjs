/**
 * fix-exercises-catalog-714.test.mjs — la migración de datos de #714 contra
 * un PocketBase real.
 *
 * Sobre un directorio VACÍO ninguna migración siembra las 263 filas
 * `source='catalog'` del catálogo de calistenia (solo quedan las yoga tras
 * `migrate up`), así que aquí solo se pueden comprobar los 3 INSERT — los 7
 * UPDATE por slug no encuentran fila y quedan como no-op documentado; eso
 * mismo se verifica también (0 filas, sin error). Corre con:
 *   pnpm test:catalog-migration
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_MIGRATIONS = resolve(ROOT, 'pb_migrations')
const PB_BINARY = process.env.PB_BINARY || resolve(ROOT, 'pocketbase')
const HAS_PB = existsSync(PB_BINARY)

function migrateUp(dataDir) {
  const r = spawnSync(PB_BINARY, ['migrate', 'up', '--dir', dataDir, '--migrationsDir', REPO_MIGRATIONS], {
    encoding: 'utf8',
    // Sobre un directorio vacío se aplican TODAS las migraciones y sus logs
    // pasan del 1 MB por defecto: en CI reventaba con ENOBUFS.
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`migrate up falló:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

function sqlQuery(db, query) {
  const r = spawnSync('sqlite3', ['-batch', '-json', db, query], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`sqlite3 falló:\n${query}\n${r.stderr || r.stdout}`)
  const out = r.stdout.trim()
  return out ? JSON.parse(out) : []
}

describe.runIf(!HAS_PB && !!process.env.CI)('el binario de PocketBase en CI', () => {
  it('existe donde apunta PB_BINARY', () => {
    expect(HAS_PB, `No hay binario en "${PB_BINARY}"`).toBe(true)
  })
})

describe.skipIf(!HAS_PB)('migración 1788960000_fix_exercises_catalog_714', () => {
  const s = {}

  beforeAll(() => {
    s.tmp = mkdtempSync(join(tmpdir(), 'catalog-714-'))
    s.db = join(s.tmp, 'data.db')
    s.out = migrateUp(s.tmp)
    s.rows = sqlQuery(
      s.db,
      `SELECT slug, source, status, priority, category, difficulty_level, is_timer,
              default_sets, default_reps, default_rest_seconds, default_timer_seconds,
              equipment, name, muscles, note, description
       FROM exercises_catalog WHERE slug IN ('german-hang','false-grip-hang','false-grip-row')
       ORDER BY slug`,
    )
  }, 120_000)

  afterAll(() => {
    if (s.tmp) rmSync(s.tmp, { recursive: true, force: true })
  })

  it('la migración se aplicó', () => {
    expect(s.out).toContain('1788960000_fix_exercises_catalog_714.js')
  })

  it('las 7 filas de UPDATE no existen en una siembra vacía: 0 filas, sin error', () => {
    expect(s.out).toContain('UPDATE ab-wheel-rollout (catalog): 0 filas (slug no encontrado)')
    expect(s.out).toContain('UPDATE scapular_pull_up (exercisedb): 0 filas (slug no encontrado)')
  })

  it('inserta exactamente las 3 filas nuevas', () => {
    expect(s.rows.map(r => r.slug)).toEqual(['false-grip-hang', 'false-grip-row', 'german-hang'])
  })

  it('german-hang lleva el contenido exacto del seed', () => {
    const row = s.rows.find(r => r.slug === 'german-hang')
    expect(JSON.parse(row.equipment)).toEqual(['pull_up_bar'])
    expect(JSON.parse(row.name)).toEqual({ es: 'German Hang (colgado invertido)', en: 'German Hang' })
    expect(row.category).toBe('skills')
    expect(row.difficulty_level).toBe('intermediate')
    expect(row.is_timer).toBe(1)
    expect(row.default_timer_seconds).toBe(15)
    expect(row.default_reps).toBe('10-20s')
    expect(row.source).toBe('catalog')
    expect(row.status).toBe('official')
    expect(row.priority).toBe('secondary')
  })

  it('false-grip-row no es temporizador y hereda category pull', () => {
    const row = s.rows.find(r => r.slug === 'false-grip-row')
    expect(row.is_timer).toBe(0)
    expect(row.default_timer_seconds).toBe(0)
    expect(row.default_reps).toBe('6-10')
    expect(row.category).toBe('pull')
  })

  it('una segunda pasada es idempotente: mismos ids, sin duplicados', () => {
    const idsAntes = sqlQuery(s.db, `SELECT id, slug FROM exercises_catalog WHERE slug LIKE 'false-grip%' OR slug = 'german-hang' ORDER BY slug`)
    sqlQuery(s.db, `DELETE FROM _migrations WHERE file = '1788960000_fix_exercises_catalog_714.js';`)
    migrateUp(s.tmp)
    const idsDespues = sqlQuery(s.db, `SELECT id, slug FROM exercises_catalog WHERE slug LIKE 'false-grip%' OR slug = 'german-hang' ORDER BY slug`)
    expect(idsDespues).toEqual(idsAntes)
  }, 60_000)
})
