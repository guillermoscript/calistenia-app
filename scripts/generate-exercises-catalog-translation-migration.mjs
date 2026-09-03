#!/usr/bin/env node
/**
 * Genera la migración que traduce al español `exercises_catalog.name` para las
 * filas que se sembraron con el catálogo VIEJO, cuando ese catálogo llevaba el
 * nombre en inglés metido también en `es` (issue #692, punto 3).
 *
 * ## Por qué existe
 *
 * En local, 143 de las 1534 filas de `exercises_catalog` tienen
 * `name.es === name.en` (p. ej. el slug `plank` → `{"en":"Plank","es":"Plank"}`).
 * El catálogo empaquetado (`packages/core/data/exercise-catalog.json`) ya trae
 * la traducción correcta para casi todas esas entradas, pero corregir el JSON
 * no cambia lo que ya está en la base de datos: la siembra
 * (1786100000/1775100005 y compañía) no reescribe filas existentes. Hace falta
 * una migración de DATOS: esta.
 *
 * La migración no puede leer `packages/core/data/exercise-catalog.json` en
 * tiempo de ejecución (el Dockerfile de producción solo copia
 * `pb_migrations/` y `pb_hooks/`), así que la tabla de traducciones viaja
 * embebida, como en 1786700000.
 *
 * ## Relación fila↔catálogo
 *
 * `exercises_catalog.slug` referencia una entrada del catálogo por su `id`
 * (p. ej. `plank`) O por su `seed_slug` (p. ej. `jumping-jacks` → id
 * `jumping_jacks`). Se resuelve probando, en orden: `slug` como id exacto,
 * `slug` como `seed_slug` exacto, y por último las mismas dos comprobaciones
 * con `slug` recortado y en minúsculas.
 *
 * ## Regla
 *
 * Solo se escribe si el `es` ACTUAL de la fila es «de máquina»: vacío, o igual
 * (recortado y en minúsculas) al `en` de la propia fila, o igual al `en` del
 * catálogo para esa entrada. Un `es` escrito por una persona pasa intacto.
 * `id` (el id de PocketBase) y `slug` NO se tocan nunca. El resto de claves del
 * json de `name`, si las hubiera, se conservan.
 *
 * Por lo mismo la migración es idempotente: en la segunda pasada el `es` de la
 * fila ya es la traducción nueva, que no coincide con ninguno de los dos
 * valores de máquina aceptados.
 *
 * ## Tabla curada
 *
 * Se incluye en `TARGETS` toda entrada del catálogo cuyos `name.es` y
 * `name.en` sean ambos no vacíos y distintos (recortados). Las entradas donde
 * el catálogo también trae `es === en` (préstamos asentados en el español de
 * la calistenia: Dragon Flag, Hollow Body Hold, Burpees...) quedan fuera a
 * propósito: no hay nada que traducir y así la migración las deja intactas en
 * vez de reescribir el mismo valor.
 *
 * ## Uso
 *
 *   node scripts/generate-exercises-catalog-translation-migration.mjs           # regenera
 *   node scripts/generate-exercises-catalog-translation-migration.mjs --check   # solo comprueba
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
const TARGET = resolve(ROOT, 'pb_migrations/1787000000_translate_exercises_catalog_names_es.js')

/** Normaliza para comparar: sin espacios sobrantes y en minúsculas. */
const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Construye las tablas que viajan embebidas en la migración a partir del
 * catálogo empaquetado.
 *
 * - `targets`  id de catálogo → { es, en } (ambos no vacíos y distintos)
 * - `slugs`    seed_slug → id, solo para los ids presentes en `targets`
 *
 * Orden de claves estable (ids ordenados alfabéticamente) para que el fichero
 * generado sea determinista entre corridas con el mismo catálogo.
 */
export function buildMaps(catalog) {
  const exercises = Object.values(catalog.categories ?? {}).flatMap((c) => c.exercises ?? [])
  const byId = {}
  for (const ex of exercises) {
    if (ex?.id) byId[ex.id] = ex
  }

  const targets = {}
  for (const id of Object.keys(byId).sort()) {
    const ex = byId[id]
    const es = String(ex.name?.es ?? '').trim()
    const en = String(ex.name?.en ?? '').trim()
    if (es && en && es !== en) {
      targets[id] = { es, en }
    }
  }

  const slugs = {}
  for (const id of Object.keys(targets)) {
    const ex = byId[id]
    if (ex.seed_slug && ex.seed_slug !== id) slugs[ex.seed_slug] = id
  }

  return { targets, slugs }
}

export function renderMigration({ targets, slugs }) {
  const count = Object.keys(targets).length
  // Un JSON.parse por tabla, en una sola línea: para goja una cadena es un
  // nodo de AST trivial (misma razón que en 1786700000 y en la siembra).
  const lit = (obj) => JSON.stringify(JSON.stringify(obj))

  return `/// <reference path="../pb_data/types.d.ts" />

/**
 * GENERADO por scripts/generate-exercises-catalog-translation-migration.mjs — no editar a mano.
 *
 * Traduce al español \`exercises_catalog.name\` en las filas sembradas con el
 * catálogo VIEJO, cuyo \`es\` quedó igual al \`en\`. Migración de DATOS: no toca
 * el esquema, solo valores, y es re-ejecutable (la segunda pasada no encuentra
 * nada que traducir).
 *
 * QUÉ ARREGLA (issue #692, punto 3)
 *
 * En local, 143 de las 1534 filas de \`exercises_catalog\` tenían
 * \`name.es === name.en\` (p. ej. el slug \`plank\` → {"en":"Plank","es":"Plank"}).
 * El catálogo empaquetado ya trae la traducción correcta para casi todas esas
 * entradas, pero corregir el JSON no reescribe lo que ya está sembrado en la
 * base de datos. De ahí esta migración.
 *
 * REGLA
 *
 * \`exercises_catalog.slug\` referencia una entrada del catálogo por su \`id\` o
 * por su \`seed_slug\`. Se resuelve probando, en orden: \`slug\` como id exacto,
 * \`slug\` como \`seed_slug\` exacto, y las mismas dos comprobaciones con \`slug\`
 * recortado y en minúsculas. Las filas cuyo \`slug\` no resuelve se dejan tal
 * cual.
 *
 * Solo se escribe si el \`es\` ACTUAL de la fila es «de máquina»: vacío, o igual
 * (recortado y en minúsculas) al \`en\` de la propia fila, o igual al \`en\` del
 * catálogo para esa entrada. Un \`es\` escrito por una persona pasa intacto. El
 * \`id\` de PocketBase y el \`slug\` NO se tocan nunca; el resto de claves del
 * json de \`name\`, si las hubiera, se conservan.
 *
 * Las entradas donde el catálogo también trae \`es === en\` (préstamos
 * asentados en el español de la calistenia) NO están en la tabla: no hay nada
 * que traducir y se dejan intactas a propósito.
 *
 * TODO EN SQL CRUDO, A PROPÓSITO: guardar con la API de records dispararía los
 * hooks de \`exercises_catalog\` sobre miles de filas de golpe.
 *
 * Tabla embebida: ${count} ejercicios traducidos.
 */

const TARGETS = JSON.parse(${lit(targets)})
const SLUGS = JSON.parse(${lit(slugs)})

migrate((app) => {
  const TAG = "[translate_exercises_catalog_names_es]"

  function norm(value) {
    return String(value === null || value === undefined ? "" : value).trim().toLowerCase()
  }

  function resolveKey(slug) {
    if (!slug) return null
    if (TARGETS[slug]) return slug
    if (SLUGS[slug]) return SLUGS[slug]
    const low = norm(slug)
    if (TARGETS[low]) return low
    if (SLUGS[low]) return SLUGS[low]
    return null
  }

  // \`name\` es json i18n (\`{"es":"...","en":"..."}\`), pero se acepta también una
  // cadena plana por si algún registro viejo se guardó así.
  function parseName(raw) {
    if (!raw) return { obj: null, es: "", en: "" }
    let value = raw
    try { value = JSON.parse(raw) } catch (e) { value = raw }
    if (value && typeof value === "object") {
      return { obj: value, es: String(value.es || ""), en: String(value.en || "") }
    }
    return { obj: null, es: String(value), en: "" }
  }

  try {
    const rows = arrayOf(new DynamicModel({ id: "", slug: "", name: "" }))
    app.db()
      .newQuery("SELECT id, slug, name FROM exercises_catalog")
      .all(rows)

    let translated = 0
    let unresolved = 0
    let humanKept = 0

    for (const row of rows) {
      const key = resolveKey(row.slug)
      if (!key) {
        unresolved++
        continue
      }

      const parsed = parseName(row.name)
      const probeEs = parsed.es.trim()
      const probeEn = parsed.en.trim()
      const target = TARGETS[key]

      // Solo se pisa un \`es\` de máquina: vacío, el \`en\` de la propia fila, o
      // el \`en\` del catálogo.
      const isMachine = probeEs === "" || norm(probeEs) === norm(probeEn) || norm(probeEs) === norm(target.en)
      if (!isMachine) {
        humanKept++
        continue
      }

      const next = {}
      if (parsed.obj) {
        for (const k in parsed.obj) {
          if (Object.prototype.hasOwnProperty.call(parsed.obj, k)) next[k] = parsed.obj[k]
        }
      }
      next.es = target.es
      next.en = target.en

      const encoded = JSON.stringify(next)
      if (encoded === row.name) continue

      app.db()
        .newQuery("UPDATE exercises_catalog SET name = {:name} WHERE id = {:id}")
        .bind({ name: encoded, id: row.id })
        .execute()
      translated++
    }

    console.log(
      TAG + " " + translated + " filas traducidas de " + rows.length + "; " +
      humanKept + " con nombre no automático que se dejan intactas; " +
      unresolved + " fuera de la tabla (préstamos con es == en en el catálogo, o slug desconocido)"
    )
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si esto falla,
    // los nombres se quedan como estaban (feo, no roto). Se reintenta
    // borrando la fila de \`_migrations\` y reiniciando.
    console.log(TAG + " FALLO, nombres sin traducir:", err)
  }
}, (app) => {
  // Sin vuelta atrás: no hay snapshot de los valores previos, y deshacer no
  // arregla nada. Volver a ejecutar es idempotente.
})
`
}

function main() {
  const check = process.argv.includes('--check')
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const maps = buildMaps(catalog)
  const rendered = renderMigration(maps)

  if (check) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf-8') : ''
    if (current !== rendered) {
      console.error(`✗ ${TARGET} no coincide con el catálogo. Regenera con: node scripts/generate-exercises-catalog-translation-migration.mjs`)
      process.exit(1)
    }
    console.log('✓ migración de traducción del catálogo al día')
    return
  }

  writeFileSync(TARGET, rendered, 'utf-8')
  console.log(
    `✓ escrito ${TARGET} (${(rendered.length / 1024).toFixed(0)} KB, ` +
    `${Object.keys(maps.targets).length} ejercicios)`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
