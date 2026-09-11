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
 *   node scripts/generate-program-seed-migration.mjs --reseed <slug>[,<slug>]
 *
 * El modo `--check` sale con código 1 si el fichero commiteado no coincide con
 * lo que producen los `programs/*.json` de ahora. Sin él, editar un programa y
 * olvidar regenerar dejaría la migración atrás sin que nada avisara.
 *
 * ## `--reseed`: llevar contenido corregido a una base que ya lo tiene (#712)
 *
 * La siembra de arriba es idempotente por `name.es`: un programa que ya existe
 * se salta ENTERO. Corregir `programs/<slug>.json` y regenerarla NO cambia
 * producción. `--reseed` emite una migración APARTE que borra las filas hijas
 * del programa y las reescribe con el contenido de ahora, conservando el
 * `programs.id` (y con él las inscripciones de `user_programs` y las copias de
 * usuario que lo acreditan en `forked_from`).
 *
 * Flujo completo:
 *
 *   1. editar programs/<slug>.json
 *   2. pnpm programs:content:check
 *   3. pnpm programs:reseed <slug>            # emite la migración de resiembra
 *                                              y regenera la siembra 1786100000
 *   4. cp -r pb_data /tmp/copia && ./pocketbase migrate up --dir /tmp/copia \
 *        --migrationsDir $(pwd)/pb_migrations
 *   5. commit: el JSON + la siembra regenerada + la migración de resiembra
 *
 * Cada resiembra es una INSTANTÁNEA histórica: se commitea y no se vuelve a
 * generar. Por eso `--check` sigue mirando solo la siembra 1786100000.
 *
 * La segunda pasada es un no-op: la migración compara el `content_hash` que
 * dejó grabado en `programs` y, si coincide, no borra ni escribe nada.
 *
 * ## Dato viejo en el cliente (lo que ESTA migración no arregla)
 *
 * Cambiar el contenido en PocketBase no basta para que el usuario lo vea: hay
 * cuatro capas de caché por delante (memoria de #690) — el service worker, el
 * precache de `/`, la caché persistida de React Query
 * (`PERSIST_BUSTER` en `packages/core/lib/query-client.ts`) y el snapshot de la
 * sesión activa. Decidido en #712: el PR de cierre de la épica #711 sube
 * `PERSIST_BUSTER` UNA vez (no una por cada PR de contenido, para no chocar
 * quince veces en la misma constante); `programs.content_hash` queda expuesto
 * para que un follow-up invalide detalle y snapshot cuando cambie; y una sesión
 * ya empezada arrastra el contenido viejo hasta que termine — aceptado.
 */

import { createHash } from 'crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

import { normalizeProgram, DAY_IDS } from './normalize-program-days.mjs'
import { normalizePriority, normalizeWeeklyProgression, resolveSection } from './lib/program-exercise-fields.mjs'
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
  // 1786000000_add_program_instructions.js).
  //
  // Vive en `data.program`, no en la raíz del documento: leerlo de `data` daba
  // `undefined`, `i18n()` lo convertía en `{ es: '' }` y los quince programas se
  // sembraban con el bloque VACÍO sin que nada se quejara. El guardarraíl no lo
  // veía porque valida el JSON de origen, donde el texto sí está, y el test de
  // la siembra tampoco lo afirmaba. Salió mirando la API con el contenido ya
  // sembrado.
  const instructions = data.program?.instructions
  if (!instructions || !String(instructions.es ?? instructions).trim()) {
    throw new Error(
      `${file}: program.instructions vacío. Es el único sitio donde al usuario ` +
      `se le explica cómo progresar; sembrarlo vacío deja el programa mudo.`,
    )
  }
  program.instructions = i18n(instructions)

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
          // #755: la rampa semanal solo viaja cuando existe, igual que
          // `deload_last_week` en la fase — así los 15 programas que no la usan
          // no cambian de payload, ni de `content_hash`, ni la siembra
          // 1786100000 que vigila `--check`.
          ...(() => {
            const wp = normalizeWeeklyProgression(ex.weekly_progression, ex.name?.es || ex.name)
            return wp ? { weekly_progression: wp } : {}
          })(),
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
      // #716: la última semana del rango es de descarga. Solo cuando está
      // puesto, para que los programas que no lo usan no cambien de payload (ni
      // de `content_hash`, ni la siembra 1786100000 que vigila `--check`).
      ...(phase.deload_last_week === true ? { deload_last_week: true } : {}),
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
        deload_last_week: phase.deload_last_week === true,
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
            // #755: lista vacía y no null cuando no hay rampa — un campo
            // json vacío es lo que el motor lee como «sin progresión».
            weekly_progression: ex.weekly_progression || [],
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

// ─── Resiembra (`--reseed`, #712) ───────────────────────────────────────────

/**
 * Timestamp de `1787100000_programs_slug_content_hash.js`, la migración que
 * añade `programs.slug` y `programs.content_hash`. Toda resiembra tiene que ir
 * DESPUÉS: sin esas columnas su `SELECT` reventaría.
 */
export const SCHEMA_MIGRATION_TS = 1787100000

/**
 * Huella del contenido con el que se resembró un programa, la que queda grabada
 * en `programs.content_hash` y convierte la segunda pasada en un no-op.
 *
 * Se calcula sobre la salida de `buildPayload()`, no sobre el `programs/*.json`
 * crudo: lo que importa es lo que ACABA en la base. Dos JSON distintos que
 * normalizan igual (un `day_id` legacy de #575, una prioridad escrita de otra
 * forma) tienen que dar el mismo hash, o cada regeneración borraría y
 * reescribiría cientos de filas para dejarlas idénticas.
 *
 * `JSON.stringify` basta como serialización canónica porque `buildPayload`
 * construye los objetos siempre en el mismo orden de claves; no hay recorrido
 * de `Object.keys` sobre datos de entrada.
 *
 * @param {object} payload salida de `buildPayload()`.
 * @returns {string} sha256 en hexadecimal.
 */
export function contentHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload), 'utf-8').digest('hex')
}

/**
 * Nombre del fichero de resiembra. A diferencia de la siembra —cuyo nombre va
 * fijo porque se REGENERA— cada resiembra es una instantánea histórica nueva y
 * necesita su propio timestamp.
 *
 * @param {string[]} slugs  programas incluidos, en orden.
 * @param {number}   timestamp  unix en segundos.
 */
export function reseedFileName(slugs, timestamp) {
  return `${timestamp}_reseed_${slugs.join('_')}.js`
}

/**
 * Fuente de la migración de resiembra.
 *
 * Mismo estilo que `renderMigration`: un `JSON.parse()` por programa y cero
 * decisiones en goja. La diferencia es que aquí TODO va en SQL crudo
 * (`app.db().newQuery()`), como en `1786500000_repair_program_exercise_names.js`:
 * escribir cientos de filas con la API de records dispararía los hooks de
 * `program_exercises` una vez por fila.
 *
 * @param {object[]} payloads   salidas de `buildPayload()`.
 * @param {{timestamp:number}} opts
 * @returns {string} el fuente completo del fichero de migración.
 */
export function renderReseedMigration(payloads, { timestamp }) {
  const slugs = payloads.map(p => p.slug)
  const counts = countRows(payloads)
  const tag = `[reseed_${slugs.join('_')}]`
  const entries = payloads
    .map(p => `  /* ${p.slug} */ { hash: ${JSON.stringify(contentHash(p))}, data: ${asJsonParseCall(p)} },`)
    .join('\n')

  return `/// <reference path="../pb_data/types.d.ts" />

/**
 * Resiembra el contenido oficial de: ${slugs.join(', ')} (issue #712).
 *
 * ⚠️ FICHERO GENERADO — no editar a mano.
 *    Fuente:  programs/*.json + scripts/lib/program-catalog.mjs
 *    Genera:  node scripts/generate-program-seed-migration.mjs --reseed ${slugs.join(',')} --ts ${timestamp}
 *
 * POR QUÉ EXISTE
 * --------------
 * \`1786100000_seed_official_programs.js\` es idempotente por \`name.es\`: un
 * programa que ya está se salta ENTERO. Corregir \`programs/<slug>.json\` y
 * regenerar la siembra no cambia nada en una base que ya sembró — producción
 * lleva el contenido del día que se sembró. Esta migración sí lo cambia: borra
 * las filas hijas del programa y las reescribe con el payload de abajo.
 *
 * INSTANTÁNEA HISTÓRICA
 * ---------------------
 * El payload es el de \`programs/<slug>.json\` en el momento de generarla, y no
 * se regenera nunca (\`pnpm programs:seed:check\` solo vigila la siembra). Si el
 * contenido vuelve a cambiar se emite OTRA migración de resiembra.
 *
 * EL \`programs.id\` NO CAMBIA
 * --------------------------
 * Del programa solo se ACTUALIZAN campos, así que las inscripciones de
 * \`user_programs\` (relación \`required\` y sin cascade, #605), las copias de
 * usuario que lo acreditan en \`forked_from\` y el historial de sesiones siguen
 * apuntando a donde apuntaban. Los ids de las filas HIJAS sí cambian en cada
 * resiembra real, y da igual: nada los referencia — los overrides
 * (\`user_program_overrides\`) y las series guardan \`exercise_id\`, no el id de
 * fila.
 *
 * SEGUNDA PASADA = NO-OP
 * ----------------------
 * Se compara el \`content_hash\` grabado en \`programs\` con el de este payload; si
 * coinciden no se borra ni se escribe nada. Importa de verdad: \`pocketbase
 * serve\` repasa las migraciones en cada arranque, y sin esta guarda cada
 * reinicio borraría y recrearía cientos de filas.
 *
 * TODO EN SQL CRUDO, A PROPÓSITO
 * ------------------------------
 * Guardar con la API de records dispararía los hooks de \`program_exercises\` una
 * vez por fila. Además el JSVM de PocketBase falla en silencio (un \`undefined\`
 * no revienta, se guarda), así que aquí no se decide nada: los valores vienen
 * ya normalizados desde Node.
 *
 * NO SE TOCAN \`is_active\`, \`is_featured\`, \`visibility\`, \`cover_image\`,
 * \`created_by\` ni \`forked_from\`: son estado de la instalación (portada subida
 * desde el editor en #618, visibilidad de #603), no contenido curado.
 *
 * Contenido: ${counts.programs} programa(s), ${counts.phases} fases, ${counts.dayConfigs} días y ${counts.exercises} ejercicios.
 */

// Un JSON.parse por programa: para goja una cadena es un nodo de AST trivial y
// el trabajo lo hace el parser nativo. Ver la cabecera de la siembra.
const RESEED = [
${entries}
]

migrate((app) => {
  const TAG = ${JSON.stringify(tag)}

  for (let i = 0; i < RESEED.length; i++) {
    const item = RESEED[i]
    const p = item.data
    const slug = p.slug

    // Un try/catch POR PROGRAMA, y que no relanza: una migración que lanza deja
    // a PocketBase sin arrancar. Si una falla, las demás siguen y el log dice
    // cuál se quedó fuera; se reintenta borrando la fila de \`_migrations\`.
    try {
      // Se localiza por \`slug\` y, para bases donde el backfill de
      // 1787100000 no llegó a poner uno, por \`name.es\` como en la siembra.
      const found = arrayOf(new DynamicModel({ id: "", content_hash: "" }))
      app.db()
        .newQuery(
          "SELECT id, content_hash FROM programs WHERE is_official = 1 AND " +
          "(slug = {:slug} OR (slug = '' AND json_extract(name, '$.es') = {:name}))"
        )
        .bind({ slug: slug, name: p.program.name.es })
        .all(found)

      if (found.length === 0) {
        console.log(TAG + " " + slug + ": no existe todavía; la siembra lo creará con este contenido.")
        continue
      }
      if (found.length > 1) {
        console.log(TAG + " " + slug + ": AMBIGUO, " + found.length + " programas oficiales casan. No se toca ninguno.")
        continue
      }

      const programId = found[0].id
      if (found[0].content_hash === item.hash) {
        console.log(TAG + " " + slug + " (" + programId + "): sin cambios.")
        continue
      }

      app.db().newQuery("DELETE FROM program_phases WHERE program = {:id}").bind({ id: programId }).execute()
      app.db().newQuery("DELETE FROM program_exercises WHERE program = {:id}").bind({ id: programId }).execute()
      app.db().newQuery("DELETE FROM program_day_config WHERE program = {:id}").bind({ id: programId }).execute()

      let nPhases = 0
      let nDays = 0
      let nExercises = 0

      for (let pi = 0; pi < p.phases.length; pi++) {
        const phase = p.phases[pi]

        // Sin \`id\`: el DEFAULT de la tabla genera 'r'||lower(hex(randomblob(7))),
        // que es exactamente el formato de id de PocketBase.
        app.db()
          .newQuery(
            "INSERT INTO program_phases (program, phase_number, name, weeks, color, sort_order, deload_last_week) " +
            "VALUES ({:program}, {:phase_number}, {:name}, {:weeks}, {:color}, {:sort_order}, {:deload_last_week})"
          )
          .bind({
            program: programId,
            phase_number: phase.phase_number,
            name: JSON.stringify(phase.name),
            weeks: phase.weeks,
            color: phase.color,
            sort_order: phase.sort_order,
            // #716. La columna la crea 1786099990, anterior a toda resiembra.
            deload_last_week: phase.deload_last_week === true ? 1 : 0,
          })
          .execute()
        nPhases++

        for (let di = 0; di < phase.days.length; di++) {
          const day = phase.days[di]
          const cfg = day.config

          app.db()
            .newQuery(
              "INSERT INTO program_day_config (program, phase_number, day_id, day_name, day_focus, day_type, day_color, sort_order) " +
              "VALUES ({:program}, {:phase_number}, {:day_id}, {:day_name}, {:day_focus}, {:day_type}, {:day_color}, {:sort_order})"
            )
            .bind({
              program: programId,
              phase_number: phase.phase_number,
              day_id: cfg.day_id,
              day_name: JSON.stringify(cfg.day_name),
              day_focus: JSON.stringify(cfg.day_focus),
              day_type: cfg.day_type,
              day_color: cfg.day_color,
              sort_order: cfg.sort_order,
            })
            .execute()
          nDays++

          for (let ei = 0; ei < day.exercises.length; ei++) {
            const ex = day.exercises[ei]

            app.db()
              .newQuery(
                "INSERT INTO program_exercises (program, phase_number, day_id, day_name, day_focus, day_type, " +
                "workout_title, exercise_id, exercise_name, sets, reps, rest_seconds, muscles, note, youtube, " +
                "priority, is_timer, timer_seconds, sort_order, section, weekly_progression) VALUES " +
                "({:program}, {:phase_number}, {:day_id}, {:day_name}, {:day_focus}, {:day_type}, " +
                "{:workout_title}, {:exercise_id}, {:exercise_name}, {:sets}, {:reps}, {:rest_seconds}, " +
                "{:muscles}, {:note}, {:youtube}, {:priority}, {:is_timer}, {:timer_seconds}, {:sort_order}, " +
                "{:section}, {:weekly_progression})"
              )
              .bind({
                program: programId,
                phase_number: phase.phase_number,
                day_id: cfg.day_id,
                day_name: JSON.stringify(cfg.day_name),
                day_focus: JSON.stringify(cfg.day_focus),
                day_type: ex.day_type,
                workout_title: JSON.stringify(ex.workout_title),
                exercise_id: ex.exercise_id,
                exercise_name: JSON.stringify(ex.exercise_name),
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: ex.rest_seconds,
                muscles: JSON.stringify(ex.muscles),
                note: JSON.stringify(ex.note),
                youtube: ex.youtube,
                priority: ex.priority,
                is_timer: ex.is_timer,
                timer_seconds: ex.timer_seconds,
                sort_order: ex.sort_order,
                section: ex.section,
                // #755: por SQL crudo los campos json van serializados a
                // mano, igual que note y muscles unas líneas más arriba.
                weekly_progression: JSON.stringify(ex.weekly_progression || []),
              })
              .execute()
            nExercises++
          }
        }
      }

      app.db()
        .newQuery(
          "UPDATE programs SET name = {:name}, description = {:description}, instructions = {:instructions}, " +
          "duration_weeks = {:duration_weeks}, difficulty = {:difficulty}, goal_type = {:goal_type}, " +
          "skill = {:skill}, intensity = {:intensity}, days_per_week = {:days_per_week}, " +
          "equipment_required = {:equipment_required}, contraindications = {:contraindications}, " +
          "slug = {:slug}, content_hash = {:content_hash} WHERE id = {:id}"
        )
        .bind({
          name: JSON.stringify(p.program.name),
          description: JSON.stringify(p.program.description),
          instructions: JSON.stringify(p.program.instructions),
          duration_weeks: p.program.duration_weeks,
          difficulty: p.program.difficulty,
          goal_type: p.program.goal_type,
          skill: p.program.skill || "",
          intensity: p.program.intensity,
          days_per_week: p.program.days_per_week,
          equipment_required: JSON.stringify(p.program.equipment_required),
          contraindications: JSON.stringify(p.program.contraindications),
          slug: slug,
          content_hash: item.hash,
          id: programId,
        })
        .execute()

      console.log(
        TAG + " " + slug + " (" + programId + "): " + nPhases + " fases, " +
        nDays + " días, " + nExercises + " ejercicios."
      )
    } catch (err) {
      console.log(TAG + " " + slug + ": FALLO, contenido sin resembrar:", err)
    }
  }
}, (app) => {
  // Down VACÍO a propósito: no hay instantánea del contenido anterior de donde
  // sacarlo. Para volver atrás: aplicar la resiembra previa de ese programa o
  // restaurar un backup de \`pb_data\`.
})
`
}

// ─── CLI ────────────────────────────────────────────────────────────────────

/**
 * Parsea los argumentos. Exportada para que los tests puedan afirmar los
 * errores de uso sin lanzar procesos.
 *
 * @param {string[]} argv  argumentos SIN `node` ni la ruta del script.
 */
export function parseArgs(argv) {
  const out = { check: false, reseed: null, ts: null }
  let collecting = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--check') { out.check = true; collecting = false; continue }
    if (arg === '--reseed') { out.reseed = out.reseed || []; collecting = true; continue }
    if (arg === '--ts') {
      const raw = argv[++i]
      if (raw === undefined) throw new Error('--ts necesita un timestamp unix en segundos.')
      const ts = Number(raw)
      if (!Number.isInteger(ts)) throw new Error(`--ts "${raw}" no es un entero.`)
      out.ts = ts
      collecting = false
      continue
    }
    if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`)

    if (!collecting) throw new Error(`Argumento suelto sin opción: "${arg}". Usa --reseed <slug>[,<slug>].`)
    for (const slug of arg.split(',')) {
      const s = slug.trim()
      // Repetir un slug duplicaría el programa en el nombre del fichero y en el
      // payload; se ignora en silencio en vez de emitir algo raro.
      if (s && !out.reseed.includes(s)) out.reseed.push(s)
    }
  }

  if (out.reseed && out.reseed.length === 0) {
    throw new Error('--reseed necesita al menos un slug. Usa --reseed <slug>[,<slug>].')
  }
  return out
}

/** Escribe la migración de resiembra (y regenera la siembra). */
function runReseed(slugs, ts) {
  const known = new Set(SKELETONS.map(s => s.slug))
  const unknown = slugs.filter(s => !known.has(s))
  if (unknown.length) {
    throw new Error(
      `Slug desconocido: ${unknown.join(', ')}.\n` +
      `   Los válidos son los de scripts/lib/program-catalog.mjs:\n` +
      `   ${SKELETONS.map(s => s.slug).join(', ')}`
    )
  }

  const timestamp = ts ?? Math.floor(Date.now() / 1000)
  if (timestamp <= SCHEMA_MIGRATION_TS) {
    throw new Error(
      `El timestamp ${timestamp} va ANTES de ${SCHEMA_MIGRATION_TS}_programs_slug_content_hash.js, ` +
      `que es la que crea las columnas "slug" y "content_hash" que esta resiembra usa.`
    )
  }

  const all = buildAllPayloads()
  // Se ordenan como SKELETONS, no como los pidió quien llama: así el mismo
  // conjunto de programas produce siempre el mismo fichero.
  const payloads = all.filter(p => slugs.includes(p.slug))
  const orderedSlugs = payloads.map(p => p.slug)

  const file = reseedFileName(orderedSlugs, timestamp)
  const target = resolve(MIGRATIONS_DIR, file)
  if (existsSync(target)) {
    throw new Error(`pb_migrations/${file} ya existe. Pasa otro --ts o borra el fichero.`)
  }

  writeFileSync(target, renderReseedMigration(payloads, { timestamp }), 'utf-8')

  const counts = countRows(payloads)
  const kb = Math.round(Buffer.byteLength(readFileSync(target, 'utf-8'), 'utf-8') / 1024)
  console.log(`✅ pb_migrations/${file} (${kb} KB)`)
  console.log(`   ${counts.programs} programa(s) · ${counts.phases} fases · ${counts.dayConfigs} días · ${counts.exercises} ejercicios`)
  for (const p of payloads) console.log(`   ${p.slug}  sha256 ${contentHash(p).slice(0, 16)}…`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.check && args.reseed) {
    throw new Error('--check y --reseed son incompatibles: uno comprueba, el otro escribe.')
  }
  if (args.ts !== null && !args.reseed) {
    throw new Error('--ts solo tiene sentido con --reseed: la siembra lleva timestamp fijo.')
  }

  if (args.reseed) {
    // La siembra se regenera SIEMPRE con la resiembra: el JSON que acabas de
    // corregir tiene que llegar también a las bases nuevas, y así
    // `pnpm programs:seed:check` no se queda en rojo tras el commit.
    runReseed(args.reseed, args.ts)
    console.log('')
  }

  const check = args.check
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
