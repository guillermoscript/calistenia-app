/**
 * reseed-program.test.mjs — La resiembra de contenido oficial, contra un
 * PocketBase de verdad (issue #712).
 *
 * ## Por qué es un test de integración
 *
 * Lo que hay que demostrar aquí no es que el generador emita el texto correcto
 * —eso lo mira un `toMatchInlineSnapshot` y no prueba nada— sino que la
 * migración, ejecutada por el JSVM de goja dentro de PocketBase, hace
 * exactamente cinco cosas y ni una más:
 *
 *   1. reescribe el contenido del programa oficial CONSERVANDO su `id`,
 *   2. no toca las copias de usuario (`is_official = 0`, `forked_from`),
 *   3. no rompe las inscripciones (`user_programs` apunta al mismo `id`),
 *   4. deja `slug` y `content_hash` para que la siguiente pasada sea un no-op,
 *   5. no roza a los otros catorce programas oficiales.
 *
 * Un stub de `pb` no prueba nada de eso (lección de #601): el JSVM falla en
 * SILENCIO —un `undefined` no revienta, se guarda—, los campos `json` viajan
 * como bytes y los booleanos los traduce el driver. La única forma de saberlo
 * es aplicar la migración sobre una base real y mirar el SQLite resultante.
 *
 * ## Cómo funciona
 *
 * `beforeAll` monta un escenario completo en un tmpdir propio:
 *
 *   1. `pocketbase migrate up` sobre un directorio VACÍO → esquema + siembra de
 *      los 15 oficiales + la migración de esquema `slug`/`content_hash`.
 *   2. Con el CLI de `sqlite3`, inyecta una COPIA de usuario del «Pull-up
 *      Roadmap» (filas hijas incluidas) y una inscripción al oficial. Son las
 *      dos cosas que la resiembra tiene prohibido tocar.
 *   3. Construye el payload real del programa, le cambia UNA nota por un
 *      centinela, genera la migración de resiembra con `renderReseedMigration`
 *      y la aplica sobre un directorio de migraciones que copia todas las del
 *      repo más esa.
 *
 * Los tests solo hacen asertos sobre el estado capturado, así que un fallo
 * señala una propiedad concreta y no «el escenario no montó».
 *
 * ## Binario y sqlite3
 *
 * Binario de PB: `PB_BINARY` o `<raíz del repo>/pocketbase`. Sin binario el
 * bloque de integración se SALTA en local (con aviso), pero en CI —donde el
 * workflow lo cachea en `/tmp/pb`— falta de binario es un FALLO: un test que se
 * salta solo en CI es un test que no existe.
 *
 * Correr con: pnpm test:program-reseed
 * Equivale a: pnpm --filter @calistenia/core exec vitest run \
 *               ../../scripts/reseed-program.test.mjs --root ../../scripts
 */

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  buildAllPayloads,
  contentHash,
  countRows,
  renderReseedMigration,
  reseedFileName,
} from './generate-program-seed-migration.mjs'
import { SKELETONS } from './lib/program-catalog.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const REPO_MIGRATIONS = resolve(ROOT, 'pb_migrations')
const SCHEMA_MIGRATION = resolve(REPO_MIGRATIONS, '1787100000_programs_slug_content_hash.js')

const PB_BINARY = process.env.PB_BINARY || resolve(ROOT, 'pocketbase')
const HAS_PB = existsSync(PB_BINARY)

/** Programa bajo prueba y timestamp fijo de la migración de resiembra. */
const SLUG = 'pull-up-roadmap'
const NAME_ES = 'Pull-up Roadmap'
const RESEED_TS = 1799000000 // > 1787100000 (la de esquema), como exige el generador
const SENTINEL = 'Centinela #712 · la resiembra llegó a la fila (acentos: ñáéíóú, "comillas")'
const TEST_USER = 'u_test712'

// ─── Utilidades de proceso ───────────────────────────────────────────────────

/**
 * Aplica las migraciones. `migrate up` es la vía real de producción (el
 * contenedor arranca con `serve`, que reaplica lo pendiente), así que se prueba
 * lo mismo que corre allí y no un atajo por la API.
 */
function migrateUp(dataDir, migrationsDir) {
  const r = spawnSync(PB_BINARY, ['migrate', 'up', '--dir', dataDir, '--migrationsDir', migrationsDir], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw r.error
  if (r.status !== 0) {
    throw new Error(`pocketbase migrate up falló (código ${r.status}):\n${r.stdout}\n${r.stderr}`)
  }
  return r.stdout
}

/**
 * Consulta con el CLI de `sqlite3` en modo `-json`.
 *
 * El modo JSON no es cosmético: las notas de los programas llevan saltos de
 * línea y comillas, y cualquier separador de texto las partiría por la mitad
 * dando comparaciones falsas. Un resultado vacío imprime la cadena vacía, no
 * un `[]`, de ahí la guarda.
 */
function sqlQuery(db, query) {
  const r = spawnSync('sqlite3', ['-batch', '-json', db, query], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`sqlite3 falló:\n${query}\n${r.stderr || r.stdout}`)
  const out = r.stdout.trim()
  return out ? JSON.parse(out) : []
}

/** Ejecuta sentencias que no devuelven filas (INSERT/DELETE). */
function sqlExec(db, statements) {
  const r = spawnSync('sqlite3', ['-batch', db, statements], { encoding: 'utf8' })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`sqlite3 falló:\n${statements}\n${r.stderr || r.stdout}`)
}

function sqlValue(db, query) {
  const rows = sqlQuery(db, query)
  if (!rows.length) return null
  return Object.values(rows[0])[0]
}

/** Id con la forma que genera PocketBase: 15 caracteres. */
function pbId(prefix = 'c') {
  return prefix + randomBytes(7).toString('hex')
}

/** Columnas reales de la tabla: la copia se arma sola aunque el esquema crezca. */
function columnsOf(db, table) {
  return sqlQuery(db, `PRAGMA table_info(${table})`).map(r => r.name)
}

const CHILD_TABLES = ['program_exercises', 'program_phases', 'program_day_config']

/** Volcado ordenado y completo (ids incluidos) de las filas hijas de un programa. */
function dumpChildren(db, programId) {
  const out = {}
  for (const t of CHILD_TABLES) {
    out[t] = sqlQuery(db, `SELECT * FROM \`${t}\` WHERE program = '${programId}' ORDER BY id`)
  }
  return out
}

/** Recuento de filas hijas por programa, para vigilar a los otros catorce. */
function childCounts(db) {
  const rows = sqlQuery(
    db,
    `SELECT p.id AS id,
       (SELECT count(*) FROM program_exercises  x WHERE x.program = p.id) AS exercises,
       (SELECT count(*) FROM program_phases     f WHERE f.program = p.id) AS phases,
       (SELECT count(*) FROM program_day_config c WHERE c.program = p.id) AS dayConfigs
     FROM programs p ORDER BY p.id`,
  )
  return Object.fromEntries(rows.map(r => [r.id, { exercises: r.exercises, phases: r.phases, dayConfigs: r.dayConfigs }]))
}

// ─── El binario es obligatorio en CI ─────────────────────────────────────────
//
// `describe.skipIf` mantiene el test corriendo en un portátil sin binario, pero
// si se saltara también en CI nadie se enteraría nunca de una resiembra rota.

describe.runIf(!HAS_PB && !!process.env.CI)('el binario de PocketBase en CI', () => {
  it('existe donde apunta PB_BINARY', () => {
    expect(
      HAS_PB,
      `No hay binario de PocketBase en "${PB_BINARY}". En CI el workflow lo cachea en /tmp/pb; ` +
        `el paso debe correr con PB_BINARY=/tmp/pb/pocketbase.`,
    ).toBe(true)
  })
})

if (!HAS_PB && !process.env.CI) {
  // `console.warn` a nivel de módulo lo captura vitest y no lo pinta nunca: el
  // aviso tiene que salir por stderr crudo o nadie se entera de que la mitad
  // del fichero no se ha ejecutado.
  process.stderr.write(
    `\n[reseed-program.test] Sin binario de PocketBase en "${PB_BINARY}": se salta el test de ` +
      `integración. Descárgalo o exporta PB_BINARY=<ruta> para ejecutarlo.\n\n`,
  )
}

// ─── Integración ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_PB)('resiembra de un programa oficial contra PocketBase real', () => {
  /** @type {{tmp: string, db: string, officialId: string, copyId: string}} */
  const s = {}

  beforeAll(() => {
    s.tmp = mkdtempSync(join(tmpdir(), 'reseed-712-'))
    s.dataDir = join(s.tmp, 'pb_data')
    s.db = join(s.dataDir, 'data.db')
    mkdirSync(s.dataDir, { recursive: true })

    // 1 ── Base limpia: esquema + siembra de los 15 + `slug`/`content_hash`.
    migrateUp(s.dataDir, REPO_MIGRATIONS)

    // Los pares slug↔name.es se capturan AQUÍ, antes de resembrar nada, para
    // que el test del mapa embebido mida el backfill y no sus efectos.
    s.slugPairsTrasSiembra = sqlQuery(
      s.db,
      `SELECT slug, json_extract(name, '$.es') AS nombre FROM programs
       WHERE is_official = 1 AND slug != '' ORDER BY slug`,
    ).map(r => [r.slug, r.nombre])

    const oficiales = sqlQuery(
      s.db,
      `SELECT id FROM programs WHERE is_official = 1 AND json_extract(name, '$.es') = '${NAME_ES}'`,
    )
    if (oficiales.length !== 1) {
      throw new Error(`Se esperaba UN «${NAME_ES}» oficial tras la siembra; hay ${oficiales.length}.`)
    }
    s.officialId = oficiales[0].id

    // 2 ── Copia de usuario + inscripción: lo que la resiembra no puede tocar.
    s.copyId = pbId()
    const progCols = columnsOf(s.db, 'programs')
    const progSelect = progCols
      .map(c => {
        if (c === 'id') return `'${s.copyId}'`
        if (c === 'is_official') return '0'
        if (c === 'is_featured') return '0'
        if (c === 'forked_from') return `'${s.officialId}'`
        if (c === 'created_by') return `'${TEST_USER}'`
        if (c === 'name') return `json('{"es":"Mi Pull-up Roadmap","en":"My Pull-up Roadmap"}')`
        // Una copia de usuario nunca lleva slug ni hash: el backfill de
        // 1787100000 solo escribe sobre `is_official = 1`.
        if (c === 'slug' || c === 'content_hash') return `''`
        return `\`${c}\``
      })
      .join(', ')
    sqlExec(
      s.db,
      `INSERT INTO programs (${progCols.map(c => `\`${c}\``).join(', ')})
       SELECT ${progSelect} FROM programs WHERE id = '${s.officialId}';`,
    )

    for (const t of CHILD_TABLES) {
      const cols = columnsOf(s.db, t)
      const select = cols
        .map(c => {
          if (c === 'id') return `('c' || lower(hex(randomblob(7))))`
          if (c === 'program') return `'${s.copyId}'`
          return `\`${c}\``
        })
        .join(', ')
      sqlExec(
        s.db,
        `INSERT INTO \`${t}\` (${cols.map(c => `\`${c}\``).join(', ')})
         SELECT ${select} FROM \`${t}\` WHERE program = '${s.officialId}';`,
      )
    }

    s.enrollmentId = pbId()
    sqlExec(
      s.db,
      `INSERT INTO user_programs (id, user, program, is_current, status, started_at, ended_at, current_phase, auto_progress)
       VALUES ('${s.enrollmentId}', '${TEST_USER}', '${s.officialId}', 1, 'active', '2026-09-01 00:00:00.000Z', '', 1, 0);`,
    )

    s.copiaAntes = dumpChildren(s.db, s.copyId)
    s.copiaProgramaAntes = sqlQuery(s.db, `SELECT * FROM programs WHERE id = '${s.copyId}'`)
    s.programaAntes = sqlQuery(s.db, `SELECT * FROM programs WHERE id = '${s.officialId}'`)
    s.oficialAntes = dumpChildren(s.db, s.officialId)
    s.recuentosAntes = childCounts(s.db)

    // 3 ── Payload real con UNA nota cambiada, y la migración que lo resiembra.
    const payload = buildAllPayloads().find(p => p.slug === SLUG)
    if (!payload) throw new Error(`No hay payload para el slug "${SLUG}".`)
    const dia = payload.phases[0].days.find(d => d.exercises.length > 0)
    if (!dia) throw new Error(`La fase 1 de "${SLUG}" no tiene ningún día con ejercicios.`)
    s.ejercicioCentinela = dia.exercises[0]
    s.ejercicioCentinela.note = { es: SENTINEL, en: 'sentinel' }

    s.payload = payload
    // El hash se calcula ANTES de renderizar: si el generador enriqueciera el
    // payload al renderizarlo, compararíamos contra otro objeto sin darnos cuenta.
    s.hashEsperado = contentHash(payload)
    s.reseedFile = reseedFileName([SLUG], RESEED_TS)

    s.migDir = join(s.tmp, 'pb_migrations')
    cpSync(REPO_MIGRATIONS, s.migDir, { recursive: true })
    writeFileSync(join(s.migDir, s.reseedFile), renderReseedMigration([payload], { timestamp: RESEED_TS }), 'utf8')

    s.salidaResiembra = migrateUp(s.dataDir, s.migDir)

    // Estado posterior, capturado de una vez.
    s.programaDespues = sqlQuery(s.db, `SELECT * FROM programs WHERE id = '${s.officialId}'`)
    s.recuentosDespues = childCounts(s.db)
    s.oficialDespues = dumpChildren(s.db, s.officialId)
    s.copiaDespues = dumpChildren(s.db, s.copyId)
    s.copiaProgramaDespues = sqlQuery(s.db, `SELECT * FROM programs WHERE id = '${s.copyId}'`)
  }, 300_000)

  afterAll(() => {
    if (s.tmp) rmSync(s.tmp, { recursive: true, force: true })
  })

  it('la migración se aplicó', () => {
    expect(s.salidaResiembra).toContain(s.reseedFile)
  })

  it('el id del programa oficial no cambia: las inscripciones apuntan a él', () => {
    // Es LA propiedad del diseño. Borrar y recrear el programa dejaría
    // inscripciones huérfanas (#605) y rompería el historial de todo el mundo.
    const filas = sqlQuery(
      s.db,
      `SELECT id FROM programs WHERE is_official = 1 AND json_extract(name, '$.es') = '${NAME_ES}'`,
    )
    expect(filas.map(f => f.id)).toEqual([s.officialId])
  })

  it('el contenido nuevo llegó a la fila: el centinela está en program_exercises', () => {
    const encontradas = sqlQuery(
      s.db,
      `SELECT id FROM program_exercises
       WHERE program = '${s.officialId}' AND json_extract(note, '$.es') = '${SENTINEL.replace(/'/g, "''")}'`,
    )
    expect(encontradas.length).toBe(1)
  })

  it('guarda el slug y el content_hash del payload resembrado', () => {
    // El hash es lo que hace idempotente la segunda pasada; el slug es la clave
    // estable programs/<slug>.json ↔ fila.
    expect(s.programaDespues[0].slug).toBe(SLUG)
    expect(s.programaDespues[0].content_hash).toBe(s.hashEsperado)
  })

  it('los recuentos de las tres tablas hijas casan con el payload', () => {
    const esperado = countRows([s.payload])
    expect({
      exercises: s.oficialDespues.program_exercises.length,
      phases: s.oficialDespues.program_phases.length,
      dayConfigs: s.oficialDespues.program_day_config.length,
    }).toEqual({
      exercises: esperado.exercises,
      phases: esperado.phases,
      dayConfigs: esperado.dayConfigs,
    })
  })

  it('la copia de usuario queda intacta, fila por fila', () => {
    // Incluye los ids: si la resiembra hubiese barrido por `exercise_id` o por
    // nombre en vez de por `program`, aquí se vería.
    expect(s.copiaDespues).toEqual(s.copiaAntes)
    expect(s.copiaProgramaDespues).toEqual(s.copiaProgramaAntes)
  })

  it('la inscripción sigue apuntando al mismo programa', () => {
    const fila = sqlQuery(s.db, `SELECT program, is_current, status FROM user_programs WHERE id = '${s.enrollmentId}'`)
    expect(fila.length).toBe(1)
    expect(fila[0].program).toBe(s.officialId)
    expect(fila[0].is_current).toBe(1)
    expect(fila[0].status).toBe('active')
  })

  it('los otros programas conservan sus recuentos', () => {
    const otros = ids => Object.fromEntries(Object.entries(ids).filter(([id]) => id !== s.officialId))
    expect(otros(s.recuentosDespues)).toEqual(otros(s.recuentosAntes))
  })

  it('los campos que no son contenido no se tocan', () => {
    // `is_active`, `is_featured`, `visibility`, `cover_image`, `created_by` y
    // `forked_from` los manda el editor o el operador, no el JSON del catálogo.
    // Una resiembra que los pisara apagaría programas o borraría portadas (#618).
    const AJENOS = ['is_active', 'is_featured', 'visibility', 'cover_image', 'created_by', 'forked_from', 'is_official']
    const recorte = fila => Object.fromEntries(AJENOS.map(k => [k, fila[k]]))
    expect(recorte(s.programaDespues[0])).toEqual(recorte(s.programaAntes[0]))
  })

  it('el contenido del programa sí se reescribe con el payload', () => {
    const p = s.programaDespues[0]
    expect(JSON.parse(p.name)).toEqual(s.payload.program.name)
    expect(JSON.parse(p.instructions)).toEqual(s.payload.program.instructions)
    expect(Number(p.duration_weeks)).toBe(s.payload.program.duration_weeks)
    expect(Number(p.days_per_week)).toBe(s.payload.program.days_per_week)
    expect(p.difficulty).toBe(s.payload.program.difficulty)
    expect(p.goal_type).toBe(s.payload.program.goal_type)
  })

  it('la resiembra real borra y recrea: los ids de las filas hijas cambian', () => {
    // Es el contrapunto del test de abajo. Sin esto, «la segunda pasada no
    // cambia los ids» pasaría también con una migración que no hace NADA nunca.
    // Nada referencia estos ids: `user_program_overrides` y el historial usan
    // `exercise_id`, no el id de la fila.
    const idsAntes = s.oficialAntes.program_exercises.map(r => r.id)
    const idsDespues = s.oficialDespues.program_exercises.map(r => r.id)
    expect(idsAntes.length).toBeGreaterThan(0)
    expect(idsDespues.filter(id => idsAntes.includes(id))).toEqual([])
  })

  it('una segunda pasada es un no-op: ni un DELETE ni un INSERT', () => {
    // El seguro real contra resembrar dos veces. Si el corto por `content_hash`
    // fallara, las filas hijas se borrarían y se recrearían con ids NUEVOS —
    // invisible en los recuentos, evidente comparando los ids.
    const antes = dumpChildren(s.db, s.officialId)

    sqlExec(s.db, `DELETE FROM _migrations WHERE file = '${s.reseedFile}';`)
    const salida = migrateUp(s.dataDir, s.migDir)
    expect(salida).toContain(s.reseedFile)

    expect(dumpChildren(s.db, s.officialId)).toEqual(antes)
    expect(sqlValue(s.db, `SELECT content_hash FROM programs WHERE id = '${s.officialId}'`)).toBe(s.hashEsperado)
  }, 120_000)

  // ── El mapa embebido en la migración de esquema ────────────────────────────
  //
  // 1787100000 no puede importar `scripts/lib/program-catalog.mjs` (el JSVM no
  // hace `import`), así que lleva los 15 pares name.es → slug copiados a mano.
  // Si el catálogo cambia un nombre y el mapa no, el backfill deja ese programa
  // sin slug y la resiembra cae al plan B por nombre... que tampoco casa.

  it('el mapa name.es → slug de la migración de esquema cubre exactamente los 15 del catálogo', () => {
    const esperado = SKELETONS.map(sk => [sk.slug, sk.name.es]).sort((a, b) => a[0].localeCompare(b[0]))
    expect(s.slugPairsTrasSiembra).toEqual(esperado)
  })
})

// ─── Unitarios: no necesitan PocketBase ──────────────────────────────────────

describe('reseedFileName', () => {
  it('compone timestamp + slugs unidos por guion bajo', () => {
    expect(reseedFileName(['a', 'b'], 1799000000)).toBe('1799000000_reseed_a_b.js')
  })

  it('con un solo slug no deja separador colgando', () => {
    expect(reseedFileName([SLUG], RESEED_TS)).toBe(`${RESEED_TS}_reseed_${SLUG}.js`)
  })
})

describe('contentHash', () => {
  it('es determinista: el mismo payload da el mismo hash', () => {
    const [a] = buildAllPayloads()
    const [b] = buildAllPayloads()
    expect(contentHash(a)).toBe(contentHash(b))
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('cambia al tocar una nota', () => {
    // Si el hash ignorase el contenido profundo, la resiembra se saltaría los
    // cambios reales creyéndose ya al día — el fallo más caro posible aquí.
    const payload = buildAllPayloads().find(p => p.slug === SLUG)
    const antes = contentHash(payload)
    const dia = payload.phases[0].days.find(d => d.exercises.length > 0)
    dia.exercises[0].note = { es: SENTINEL, en: 'sentinel' }
    expect(contentHash(payload)).not.toBe(antes)
  })

  it('dos programas distintos no comparten hash', () => {
    const payloads = buildAllPayloads()
    expect(new Set(payloads.map(contentHash)).size).toBe(payloads.length)
  })
})

describe('la migración de esquema existe con el timestamp acordado', () => {
  it('1787100000_programs_slug_content_hash.js está en pb_migrations', () => {
    // El generador rechaza timestamps <= 1787100000; si alguien renombra la
    // migración de esquema, esa validación deja de significar nada.
    expect(existsSync(SCHEMA_MIGRATION), `falta ${SCHEMA_MIGRATION}`).toBe(true)
    const src = readFileSync(SCHEMA_MIGRATION, 'utf8')
    expect(src).toContain('content_hash')
    expect(src).toContain('slug')
  })
})
