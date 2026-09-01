#!/usr/bin/env node
/**
 * Genera la migración que repara `program_exercises.exercise_name` cuando lleva
 * un id/slug del catálogo en vez de un nombre («arm_circles», «sphinx_pushup»).
 *
 * ## Por qué existe
 *
 * Los dos programas intermedios se sembraron con el slug de la BD como nombre
 * visible (352 filas en prod: 177 de «Intermedio · Definición» y 175 de
 * «Intermedio · Hipertrofia»), y `duplicateProgram` copia el par tal cual, así
 * que el mal se propagó a las copias de los usuarios. El PR #675 arregló los
 * `programs/*.json`, pero la migración de siembra (1786100000) salta ENTERO
 * cualquier programa que ya exista por `name.es`, así que producción se quedó
 * con las filas viejas. El PR #687 pinta bien esas filas en la app
 * (`resolveExerciseNameField`, packages/core/lib/exercise-resolver.ts); esta
 * migración deja el DATO bien para que nada tenga que resolver al vuelo.
 *
 * La migración no puede leer `packages/core/data/exercise-catalog.json`: el
 * Dockerfile de producción solo copia `pb_migrations/` y `pb_hooks/`. Por eso el
 * mapa id → nombre `{es,en}` (y seed_slug → id) viaja embebido, como en la
 * migración de siembra.
 *
 * ## Regla (espejo de `resolveExerciseNameField`)
 *
 * Solo se toca una fila si su nombre PARECE una clave de máquina (es un id o
 * seed_slug exacto del catálogo, casa con `^[a-z0-9]+([_-][a-z0-9]+)+$`, o está
 * vacío) Y resuelve con confianza a una entrada del catálogo, probando primero
 * el nombre y luego `exercise_id`. Un nombre escrito por una persona pasa
 * intacto. `exercise_id` NO se toca nunca: es la clave del historial de series,
 * PRs y `user_program_overrides`.
 *
 * ## Uso
 *
 *   node scripts/generate-exercise-name-repair-migration.mjs           # regenera
 *   node scripts/generate-exercise-name-repair-migration.mjs --check   # solo comprueba
 *
 * El timestamp del fichero va FIJO: es la identidad de la migración para
 * PocketBase. Una vez aplicada en prod, regenerarla no la vuelve a ejecutar.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CATALOG_PATH = resolve(ROOT, 'packages/core/data/exercise-catalog.json')
const TARGET = resolve(ROOT, 'pb_migrations/1786500000_repair_program_exercise_names.js')

/**
 * Claves que están en prod y no son id ni seed_slug de nada. Se listan a mano
 * para no adivinar: cada entrada se comprobó contra el catálogo. `sit_ups` son
 * dos filas de los intermedios que el JSON corregido siembra como `sit_up`.
 */
export const ALIASES = {
  sit_ups: 'sit_up',
}

export function buildMaps(catalog) {
  const names = {}
  const slugs = {}
  for (const cat of Object.values(catalog.categories ?? {})) {
    for (const ex of cat.exercises ?? []) {
      if (!ex?.id || !ex.name) continue
      const name = typeof ex.name === 'string' ? { es: ex.name, en: ex.name } : ex.name
      if (!name.es && !name.en) continue
      names[ex.id] = { es: name.es || name.en, en: name.en || name.es }
      if (ex.seed_slug && ex.seed_slug !== ex.id) slugs[ex.seed_slug] = ex.id
    }
  }
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (!names[id]) throw new Error(`ALIASES: «${alias}» apunta a «${id}», que no está en el catálogo`)
    slugs[alias] = id
  }
  return { names, slugs }
}

export function renderMigration({ names, slugs }) {
  const nameCount = Object.keys(names).length
  const slugCount = Object.keys(slugs).length
  // Un JSON.parse por mapa, cada uno en su línea: para goja una cadena es un
  // nodo de AST trivial (misma razón que en la migración de siembra).
  const namesLiteral = JSON.stringify(JSON.stringify(names))
  const slugsLiteral = JSON.stringify(JSON.stringify(slugs))

  return `/// <reference path="../pb_data/types.d.ts" />

/**
 * GENERADO por scripts/generate-exercise-name-repair-migration.mjs — no editar a mano.
 *
 * Repara \`program_exercises.exercise_name\` cuando lleva un id/slug del catálogo
 * («arm_circles», «sphinx_pushup») en vez de un nombre. Migración de DATOS: no
 * toca el esquema, solo valores, y es re-ejecutable (la segunda pasada no
 * encuentra nada que reparar).
 *
 * QUÉ ARREGLA
 *
 * Los dos programas intermedios se sembraron con el slug como nombre visible
 * (352 filas en prod) y \`duplicateProgram\` copió el par a las copias de los
 * usuarios. El PR #675 arregló los JSON, pero la siembra (1786100000) salta los
 * programas que ya existen, así que producción se quedó con el dato viejo.
 * El PR #687 lo pinta bien al vuelo (\`resolveExerciseNameField\`); aquí se deja
 * bien el dato para todos los programas, oficiales y copias.
 *
 * REGLA (espejo de \`resolveExerciseNameField\` en packages/core/lib/exercise-resolver.ts)
 *
 * Solo se toca una fila si su nombre PARECE una clave de máquina (id o seed_slug
 * exacto del catálogo, casa con \`^[a-z0-9]+([_-][a-z0-9]+)+$\`, o está vacío) Y
 * resuelve con confianza a una entrada del catálogo, probando el nombre y luego
 * \`exercise_id\`. Un nombre escrito por una persona pasa intacto. \`exercise_id\`
 * NO se toca: es la clave del historial de series, PRs y user_program_overrides.
 *
 * TODO EN SQL CRUDO, A PROPÓSITO: guardar con la API de records dispararía los
 * hooks de \`program_exercises\` sobre cientos de filas de golpe.
 *
 * Catálogo embebido: ${nameCount} ids, ${slugCount} seed_slugs y alias.
 */

const NAMES = JSON.parse(${namesLiteral})
const SLUGS = JSON.parse(${slugsLiteral})

migrate((app) => {
  const TAG = "[repair_program_exercise_names]"
  const MACHINE_RE = /^[a-z0-9]+([_-][a-z0-9]+)+$/

  function resolveKey(cand) {
    if (!cand) return null
    if (NAMES[cand]) return cand
    if (SLUGS[cand]) return SLUGS[cand]
    const low = cand.toLowerCase().trim()
    if (NAMES[low]) return low
    if (SLUGS[low]) return SLUGS[low]
    return null
  }

  // \`exercise_name\` es json i18n (\`{"es":"...","en":"..."}\`), pero hubo épocas en
  // que se guardó como cadena plana; se aceptan las dos formas.
  function probeOf(raw) {
    if (!raw) return ""
    let value = raw
    try { value = JSON.parse(raw) } catch (e) { value = raw }
    if (value && typeof value === "object") return String(value.es || value.en || "").trim()
    return String(value).trim()
  }

  try {
    const rows = arrayOf(new DynamicModel({ id: "", exercise_id: "", exercise_name: "" }))
    app.db()
      .newQuery("SELECT id, exercise_id, exercise_name FROM program_exercises")
      .all(rows)

    let fixed = 0
    let unresolved = 0
    const samples = []

    for (const row of rows) {
      const probe = probeOf(row.exercise_name)
      const machine = !probe || !!NAMES[probe] || !!SLUGS[probe] || MACHINE_RE.test(probe)
      if (!machine) continue

      const key = resolveKey(probe) || resolveKey(row.exercise_id)
      if (!key) {
        unresolved++
        if (samples.length < 20 && samples.indexOf(probe || row.exercise_id) === -1) samples.push(probe || row.exercise_id)
        continue
      }

      const next = JSON.stringify(NAMES[key])
      if (next === row.exercise_name) continue

      app.db()
        .newQuery("UPDATE program_exercises SET exercise_name = {:name} WHERE id = {:id}")
        .bind({ name: next, id: row.id })
        .execute()
      fixed++
    }

    console.log(
      TAG + " " + fixed + " filas reparadas de " + rows.length + "; " +
      unresolved + " con clave de máquina que no resuelve" +
      (samples.length ? " (p.ej. " + samples.join(", ") + ")" : "")
    )
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si esto falla, los
    // datos se quedan como hoy (la app los pinta bien igualmente, #687). Se
    // reintenta borrando la fila de \`_migrations\` y reiniciando.
    console.log(TAG + " FALLO, nombres sin reparar:", err)
  }
}, (app) => {
  // Sin vuelta atrás: no hay snapshot de los valores previos, y un nombre
  // humano nunca es peor que un slug. Volver a ejecutar es idempotente.
})
`
}

function main() {
  const check = process.argv.includes('--check')
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const rendered = renderMigration(buildMaps(catalog))

  if (check) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf-8') : ''
    if (current !== rendered) {
      console.error(`✗ ${TARGET} no coincide con el catálogo. Regenera con: node scripts/generate-exercise-name-repair-migration.mjs`)
      process.exit(1)
    }
    console.log('✓ migración de reparación al día')
    return
  }

  writeFileSync(TARGET, rendered, 'utf-8')
  console.log(`✓ escrito ${TARGET} (${(rendered.length / 1024).toFixed(0)} KB)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
