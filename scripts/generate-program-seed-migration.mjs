#!/usr/bin/env node
/**
 * Genera la migración que siembra los 15 programas oficiales (issue #615).
 *
 * ## Por qué existe
 *
 * El catálogo curado vive en `programs/*.json` y hasta ahora solo llegaba a
 * PocketBase corriendo a mano `seed-program-catalog.mjs` + `update-program-content.mjs`
 * con credenciales de superusuario. Producción, desarrollo y cada worktree
 * acababan con catálogos distintos.
 *
 * La migración no puede leer esos ficheros: el `Dockerfile` de producción solo
 * copia `pb_migrations/` y `pb_hooks/`, así que `programs/` no existe dentro del
 * contenedor. El contenido tiene que viajar DENTRO del fichero de migración.
 *
 * ## `exercise_id` tiene que ser el id del catálogo
 *
 * Hasta esta versión el generador sembraba `program_exercises.exercise_id` con
 * una CLAVE DE HUECO propia (`${day_id}_${phase_number}_${sort_order}`, p.ej.
 * `lun_1_4`) y tiraba el id de catálogo real que trae cada ejercicio del JSON
 * (`pushup_std`, `pike_pushup`...). Esa clave nunca resolvía contra
 * `resolveExerciseId()` (`packages/core/lib/resolveExerciseId.ts`), así que
 * `useAutoProgression` (#617) jamás encontraba variantes del catálogo para el
 * ejercicio y la sugerencia `kind: 'variant'` —pasar de flexión de rodillas a
 * flexión completa— no se disparaba NUNCA en ningún programa oficial; la media
 * del catálogo tampoco resolvía. Ahora se siembra el id canónico, resuelto con
 * la misma lógica que `resolveExerciseId.ts` (ver `resolveCatalogExerciseId`
 * más abajo), y un id que no resuelve hace fallar la generación en vez de
 * colarse silenciosamente.
 *
 * ## Por qué un generador y no una migración escrita a mano
 *
 * Toda la normalización se hace aquí, en Node, con los helpers que ya tienen
 * tests: `normalizeProgram` (remapea el `day_id` legacy de #575 e infiere
 * `day_type`) y `normalizePriority`/`resolveSection` (traducen el vocabulario
 * del JSON al enum de la app, #607).
 *
 * La migración que sale de aquí no toma ni una decisión: recorre el payload y
 * llama a `app.save()`. Es deliberado — el JSVM de PocketBase falla en silencio
 * (un `undefined` no revienta, se guarda), y duplicar `inferDayType` en goja
 * sería poner lógica justo en el único sitio donde no se puede depurar.
 *
 * ## Forma del fichero generado
 *
 * El payload sale como una llamada a `JSON.parse()` por programa, cada una en su
 * línea. Dos motivos:
 *
 *   - **Coste de arranque.** PocketBase parsea todos los ficheros de
 *     `pb_migrations/` en cada arranque, no solo los pendientes. Para goja, una
 *     cadena es un nodo de AST trivial y el trabajo real lo hace el parser JSON
 *     nativo; un literal de objeto de ~1 MB serían decenas de miles de nodos.
 *   - **Diffs.** Tocar un programa cambia una línea, no el fichero entero.
 *
 * ## Uso
 *
 *   node scripts/generate-program-seed-migration.mjs           # escribe
 *   node scripts/generate-program-seed-migration.mjs --check   # solo comprueba
 *
 * El modo `--check` sale con código 1 si el fichero commiteado no coincide con
 * lo que producen los `programs/*.json` de ahora. Sin él, editar un programa y
 * olvidar regenerar dejaría la migración atrás sin que nada avisara.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

import { normalizeProgram, DAY_IDS } from './normalize-program-days.mjs'
import { normalizePriority, resolveSection } from './lib/program-exercise-fields.mjs'
import { SKELETONS, CATALOG_BY_SLUG, assertCatalogMatchesFiles } from './lib/program-catalog.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PROGRAMS_DIR = resolve(ROOT, 'programs')
const MIGRATIONS_DIR = resolve(ROOT, 'pb_migrations')

/**
 * Nombre del fichero de migración.
 *
 * Va fijo, no derivado de la fecha: el timestamp es la identidad de la
 * migración para PocketBase, y regenerar el contenido no puede cambiarla o cada
 * regeneración se aplicaría como una migración nueva sobre bases que ya la
 * tienen puesta.
 */
const MIGRATION_FILE = '1786100000_seed_official_programs.js'

/** Metadatos del día de descanso que el JSON de contenido no trae. */
const REST_DAY_NAME = {
  lun: { es: 'Lunes', en: 'Monday' }, mar: { es: 'Martes', en: 'Tuesday' }, mie: { es: 'Miércoles', en: 'Wednesday' },
  jue: { es: 'Jueves', en: 'Thursday' }, vie: { es: 'Viernes', en: 'Friday' }, sab: { es: 'Sábado', en: 'Saturday' },
  dom: { es: 'Domingo', en: 'Sunday' },
}
const REST_FOCUS = { es: 'Descanso', en: 'Rest' }
const REST_COLOR = '#888899'

const CATALOG_PATH = resolve(ROOT, 'packages/core/data/exercise-catalog.json')

/**
 * Mismo normalizador que `packages/core/lib/catalogIndex.ts::normalizeForLookup`.
 * Deliberadamente NO se importa ese fichero (es TypeScript, y este script corre
 * como Node plano sin transpilar): se copia la función, de tres líneas, para no
 * arrastrar un paso de build a un generador que hoy no lo necesita.
 */
function normalizeForLookup(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Índice del catálogo para resolver `exercise_id`, espejo EXACTO de
 * `buildCatalogIndex()` en `packages/core/lib/catalogIndex.ts` — mismos tres
 * mapas (`ids`, `bySeedSlug`, `byName`) y misma regla de ambigüedad: un nombre
 * normalizado que apunte a más de un id de catálogo no se indexa, para no
 * arriesgar una resolución equivocada.
 */
function buildCatalogResolver() {
  const raw = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const ids = new Set()
  const bySeedSlug = new Map()
  const nameCounts = new Map()

  for (const catName of Object.keys(raw.categories || {})) {
    for (const ex of raw.categories[catName]?.exercises || []) {
      ids.add(ex.id)
      if (ex.seed_slug) bySeedSlug.set(ex.seed_slug, ex.id)

      for (const n of [ex.name?.es, ex.name?.en]) {
        if (!n) continue
        const norm = normalizeForLookup(n)
        if (!norm) continue
        const seen = nameCounts.get(norm)
        if (seen) seen.add(ex.id)
        else nameCounts.set(norm, new Set([ex.id]))
      }
    }
  }

  const byName = new Map()
  for (const [norm, idSet] of nameCounts) {
    if (idSet.size === 1) byName.set(norm, idSet.values().next().value)
    // Ambiguo: se salta en silencio, igual que el índice de runtime.
  }

  return { ids, bySeedSlug, byName }
}

const catalogResolver = buildCatalogResolver()

/**
 * Resuelve el `exercise_id` de un ejercicio del JSON contra el id canónico del
 * catálogo. Mismo orden que el paso a paso de `resolveExerciseId()`: id exacto
 * → `seed_slug` (crudo y normalizado) → nombre normalizado es/en sin
 * ambigüedad. La única diferencia deliberada con el resolver de runtime: ahí un
 * fallo devuelve el input intacto (es un resolver conservador para el
 * navegador, donde reventar sería peor que no traducir); aquí un fallo LANZA.
 * Sembrar una clave inventada en la migración es justo el bug que este cambio
 * corrige — dejarlo pasar en silencio lo reintroduciría.
 *
 * @param {string} input   `exercise_id` tal cual viene del JSON de contenido.
 * @param {string} context describe programa/fase/día/ejercicio, para el error.
 */
function resolveCatalogExerciseId(input, context) {
  if (!input) {
    throw new Error(`${context}: falta "exercise_id" en el JSON de origen.`)
  }
  if (catalogResolver.ids.has(input)) return input

  const slugHit = catalogResolver.bySeedSlug.get(input)
  if (slugHit) return slugHit

  const norm = normalizeForLookup(input)
  const normSlugHit = catalogResolver.bySeedSlug.get(norm)
  if (normSlugHit) return normSlugHit

  const nameHit = catalogResolver.byName.get(norm)
  if (nameHit) return nameHit

  throw new Error(
    `${context}: exercise_id "${input}" no resuelve contra el catálogo ` +
    `(packages/core/data/exercise-catalog.json). Ni id exacto, ni seed_slug, ` +
    `ni nombre es/en casan con ninguna entrada.`
  )
}

/**
 * Envuelve un valor suelto en la forma `{es, en}` que usan los campos json de
 * PocketBase. Espejo del helper de `update-program-content.mjs`: si el JSON ya
 * trae un objeto se respeta, y si no, el texto plano se toma como español.
 */
function i18n(value) {
  if (!value) return { es: '' }
  if (typeof value === 'object') return value
  return { es: value }
}

/**
 * Lee y normaliza los `programs/*.json`, ordenados por el orden del catálogo.
 * Exportada junto a `buildPayload` para que los tests (y esta verificación
 * manual) puedan recorrer los programas uno a uno sin pasar por `main()`.
 */
export function loadPrograms() {
  const files = readdirSync(PROGRAMS_DIR).filter(f => f.endsWith('.json'))
  const slugs = files.map(f => basename(f, '.json'))

  const problems = assertCatalogMatchesFiles(slugs)
  if (problems.length) {
    throw new Error(`El catálogo y programs/ no casan:\n  - ${problems.join('\n  - ')}`)
  }

  // El orden lo manda SKELETONS, no `readdir`: así el fichero generado es
  // estable entre sistemas de ficheros y `--check` no da falsos positivos.
  return SKELETONS.map(entry => {
    const file = `${entry.slug}.json`
    const data = JSON.parse(readFileSync(resolve(PROGRAMS_DIR, file), 'utf-8'))

    // Normaliza in place: `day_id` legacy (`d1..d6`) → `lun..dom`, y `day_type`
    // inferido donde falte. El payload sale ya normalizado, así que la migración
    // no arrastra la deuda de #575 ni necesita `normalize-program-days.mjs`.
    normalizeProgram(data, file)

    const badDays = data.phases.flatMap(p => p.days.map(d => d.day_id)).filter(id => !DAY_IDS.includes(id))
    if (badDays.length) {
      throw new Error(`${file}: day_id fuera de lun..dom tras normalizar: ${badDays.join(', ')}`)
    }
    return { entry, file, data }
  })
}

/**
 * Traduce un programa a la forma exacta que la migración escribirá en
 * PocketBase: nada de campos crudos del JSON, nada que decidir en goja.
 * Exportada para los tests (ver `loadPrograms`).
 */
export function buildPayload({ entry, file, data }) {
  const program = {
    name: entry.name,
    description: entry.description,
    duration_weeks: entry.duration_weeks,
    difficulty: entry.difficulty,
    goal_type: entry.goal_type,
    intensity: entry.intensity,
    days_per_week: entry.days_per_week,
    equipment_required: entry.equipment_required,
    contraindications: entry.contraindications,
    is_active: true,
    is_official: true,
    is_featured: false,
    // Catálogo curado: público explícito (#603).
    visibility: 'public',
  }
  // `skill` solo significa algo con `goal_type === 'skill'`; mandarlo vacío en
  // los demás metería una cadena vacía en un `select` opcional.
  if (entry.skill) program.skill = entry.skill

  // «Cómo seguir este programa» (#618, campo añadido en
  // 1786000000_add_program_instructions.js). `i18n()` ya cubre el caso de que
  // el JSON no lo traiga todavía: `undefined` cae a `{ es: '' }`, así que no
  // hace falta un default aparte ni falla mientras el contenido se termina de
  // rellenar en paralelo.
  program.instructions = i18n(data.instructions)

  const phases = data.phases.map(phase => {
    const byId = new Map(phase.days.map(d => [d.day_id, d]))

    // Semana completa: los siete días, con descanso explícito donde el
    // contenido no define nada. Es lo que hace `update-program-content.mjs`, y
    // sin ello el detalle del programa enseña huecos en vez de días de descanso.
    const days = DAY_IDS.map((dayId, i) => {
      const day = byId.get(dayId)
      const config = {
        day_id: dayId,
        day_name: i18n(day?.day_name || REST_DAY_NAME[dayId]),
        day_focus: i18n(day?.day_focus || REST_FOCUS),
        day_type: day ? day.day_type : 'rest',
        day_color: day?.day_color || (day ? phase.color || '' : REST_COLOR),
        sort_order: i + 1,
      }

      const exercises = (day?.exercises || []).map(ex => {
        const context = `${file}: fase ${phase.phase_number}, día ${day.day_id}, ` +
          `ejercicio "${ex.name?.es || ex.name || '(sin nombre)'}" (sort_order ${ex.sort_order})`
        return {
          day_type: day.day_type,
          workout_title: i18n(day.workout_title),
          // Id CANÓNICO del catálogo, no la clave de hueco `día_fase_orden` que
          // se sembraba antes (ver cabecera del fichero). Revienta si no
          // resuelve: ver `resolveCatalogExerciseId`.
          exercise_id: resolveCatalogExerciseId(ex.exercise_id, context),
          exercise_name: i18n(ex.name),
          sets: ex.sets,
          reps: ex.reps || '',
          rest_seconds: ex.rest_seconds || 0,
          muscles: i18n(ex.muscles || ''),
          note: i18n(ex.note || ''),
          youtube: ex.youtube || '',
          priority: normalizePriority(ex.priority, ex.name?.es || ex.name),
          is_timer: ex.is_timer || false,
          timer_seconds: ex.timer_seconds || 0,
          sort_order: ex.sort_order,
          section: resolveSection(ex),
        }
      })

      return { config, exercises }
    })

    return {
      phase_number: phase.phase_number,
      name: i18n(phase.name),
      weeks: phase.weeks,
      color: phase.color || '',
      sort_order: phase.phase_number,
      days,
    }
  })

  return { slug: entry.slug, file, program, phases }
}

/** Cuenta filas por colección, para el informe y para los tests. */
export function countRows(payloads) {
  let phases = 0, dayConfigs = 0, exercises = 0
  for (const p of payloads) {
    phases += p.phases.length
    for (const ph of p.phases) {
      dayConfigs += ph.days.length
      for (const d of ph.days) exercises += d.exercises.length
    }
  }
  return { programs: payloads.length, phases, dayConfigs, exercises }
}

/** Construye el payload completo. Exportado para los tests. */
export function buildAllPayloads() {
  return loadPrograms().map(buildPayload)
}

/**
 * Serializa un payload como argumento de `JSON.parse`.
 *
 * Doble `JSON.stringify`: el interior produce el JSON, y el exterior lo
 * convierte en un literal de cadena de JavaScript con todo escapado —comillas,
 * barras invertidas y los saltos de línea que traen algunas notas—. Hacerlo a
 * mano es exactamente el tipo de escape que se rompe con una nota en español.
 */
function asJsonParseCall(value) {
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))})`
}

function renderMigration(payloads) {
  const counts = countRows(payloads)
  const entries = payloads
    .map(p => `  /* ${p.slug} */ ${asJsonParseCall(p)},`)
    .join('\n')

  return `/// <reference path="../pb_data/types.d.ts" />

/**
 * Siembra los 15 programas oficiales del catálogo curado (issue #615).
 *
 * ⚠️ FICHERO GENERADO — no editar a mano.
 *    Fuente:  programs/*.json + scripts/lib/program-catalog.mjs
 *    Genera:  node scripts/generate-program-seed-migration.mjs
 *    Verifica: pnpm programs:seed:check
 *
 * Hasta ahora este contenido solo entraba corriendo a mano
 * \`scripts/seed-program-catalog.mjs\` y \`scripts/update-program-content.mjs\` con
 * credenciales de superusuario, así que producción, desarrollo y cada worktree
 * tenían catálogos distintos. El payload viaja embebido porque el Dockerfile de
 * producción solo copia \`pb_migrations/\` y \`pb_hooks/\`: \`programs/\` no existe
 * dentro del contenedor.
 *
 * Idempotente por \`name.es\`, igual que la de yoga (1775100006): un programa que
 * ya existe se salta ENTERO. Esta migración siembra lo que falta; no repara
 * contenido a medias —eso lo sigue haciendo \`update-program-content.mjs\`, que
 * borra y recrea— porque una migración no puede pisar lo que alguien haya
 * editado desde el editor.
 *
 * Las reglas de API de \`1784700000_programs_official_flags_guard.js\` no aplican
 * aquí: solo miran peticiones HTTP, y \`app.save()\` desde una migración no lo es.
 * Por eso \`is_official: true\` entra sin rol de admin.
 *
 * Contenido: ${counts.programs} programas, ${counts.phases} fases, ${counts.dayConfigs} días y ${counts.exercises} ejercicios.
 */

// Un JSON.parse por programa: para goja una cadena es un nodo de AST trivial y
// el trabajo lo hace el parser nativo, mientras que un literal de objeto de este
// tamaño serían decenas de miles de nodos parseados en CADA arranque de PB.
const PROGRAMS = [
${entries}
]

migrate((app) => {
  function createRecord(collectionName, data) {
    const col = app.findCollectionByNameOrId(collectionName)
    const rec = new Record(col)
    for (const key in data) {
      rec.set(key, data[key])
    }
    app.save(rec)
    return rec
  }

  for (let i = 0; i < PROGRAMS.length; i++) {
    const p = PROGRAMS[i]

    // Idempotencia: si ya hay un programa con este nombre, no se toca nada.
    // \`findFirstRecordByFilter\` lanza cuando no encuentra, de ahí el try/catch —
    // es el mismo patrón que usa la migración de yoga.
    let existing = null
    try {
      existing = app.findFirstRecordByFilter('programs', 'name.es = {:name}', { name: p.program.name.es })
    } catch (e) {
      existing = null
    }
    if (existing) continue

    const program = createRecord('programs', p.program)
    const programId = program.id

    for (let pi = 0; pi < p.phases.length; pi++) {
      const phase = p.phases[pi]

      createRecord('program_phases', {
        program: programId,
        phase_number: phase.phase_number,
        name: phase.name,
        weeks: phase.weeks,
        color: phase.color,
        sort_order: phase.sort_order,
      })

      for (let di = 0; di < phase.days.length; di++) {
        const day = phase.days[di]
        const cfg = day.config

        createRecord('program_day_config', {
          program: programId,
          phase_number: phase.phase_number,
          day_id: cfg.day_id,
          day_name: cfg.day_name,
          day_focus: cfg.day_focus,
          day_type: cfg.day_type,
          day_color: cfg.day_color,
          sort_order: cfg.sort_order,
        })

        for (let ei = 0; ei < day.exercises.length; ei++) {
          const ex = day.exercises[ei]
          createRecord('program_exercises', {
            program: programId,
            phase_number: phase.phase_number,
            day_id: cfg.day_id,
            day_name: cfg.day_name,
            day_focus: cfg.day_focus,
            day_type: ex.day_type,
            workout_title: ex.workout_title,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            muscles: ex.muscles,
            note: ex.note,
            youtube: ex.youtube,
            priority: ex.priority,
            is_timer: ex.is_timer,
            timer_seconds: ex.timer_seconds,
            sort_order: ex.sort_order,
            section: ex.section,
          })
        }
      }
    }
  }
}, (app) => {
  // Down: borra los programas sembrados por su nombre.
  //
  // \`program_phases\`, \`program_exercises\` y \`program_day_config\` tienen
  // \`cascadeDelete\`, así que se van solas. \`user_programs\` NO: su relación es
  // \`required\` y SIN cascade, la combinación que hace que PocketBase RECHACE el
  // borrado del padre en vez de limpiar (#605). Con una sola inscripción viva,
  // \`app.delete(program)\` falla; por eso las inscripciones se borran primero.
  for (let i = 0; i < PROGRAMS.length; i++) {
    try {
      const program = app.findFirstRecordByFilter('programs', 'name.es = {:name}', { name: PROGRAMS[i].program.name.es })
      if (!program) continue

      try {
        const enrollments = app.findRecordsByFilter('user_programs', 'program = {:id}', '', 0, 0, { id: program.id })
        for (let j = 0; j < enrollments.length; j++) {
          app.delete(enrollments[j])
        }
      } catch (e) { /* sin inscripciones */ }

      app.delete(program)
    } catch (e) { /* no estaba: nada que deshacer */ }
  }
})
`
}

function main() {
  const check = process.argv.includes('--check')
  const payloads = buildAllPayloads()
  const rendered = renderMigration(payloads)
  const target = resolve(MIGRATIONS_DIR, MIGRATION_FILE)
  const counts = countRows(payloads)

  if (check) {
    if (!existsSync(target)) {
      console.error(`❌ Falta pb_migrations/${MIGRATION_FILE}. Corre: node scripts/generate-program-seed-migration.mjs`)
      process.exit(1)
    }
    const current = readFileSync(target, 'utf-8')
    if (current !== rendered) {
      console.error(
        `❌ pb_migrations/${MIGRATION_FILE} no coincide con programs/*.json.\n` +
        `   Alguien editó el contenido y no regeneró la migración.\n` +
        `   Corre: node scripts/generate-program-seed-migration.mjs`
      )
      process.exit(1)
    }
    console.log(`✅ ${MIGRATION_FILE} al día (${counts.programs} programas, ${counts.exercises} ejercicios).`)
    return
  }

  writeFileSync(target, rendered, 'utf-8')
  const kb = Math.round(Buffer.byteLength(rendered, 'utf-8') / 1024)
  console.log(`✅ pb_migrations/${MIGRATION_FILE} (${kb} KB)`)
  console.log(`   ${counts.programs} programas · ${counts.phases} fases · ${counts.dayConfigs} días · ${counts.exercises} ejercicios`)
}

// Solo corre como CLI; importado desde los tests no debe escribir nada.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main()
  } catch (e) {
    console.error('❌', e.message)
    process.exit(1)
  }
}
