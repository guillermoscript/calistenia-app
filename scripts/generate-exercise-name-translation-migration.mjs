#!/usr/bin/env node
/**
 * Genera la migración que traduce al español `program_exercises.exercise_name`
 * para los ejercicios cuyo `name.es` del catálogo estaba en inglés.
 *
 * ## Por qué existe
 *
 * El catálogo empaquetado llevaba 133 entradas con `name.es === name.en` y otras
 * 49 con un `es` claramente inglés («Glute Bridge Unilateral»), así que la UI en
 * español pintaba «Plank», «Arm Circles» o «Diamond Push-up» (issue #690). Este
 * PR traduce esos nombres en las CAPAS DE ORIGEN del catálogo
 * (`packages/core/data/exercise-catalog.base.json`, `seeds/exercises/*.json` y
 * `seeds/exercisedb/exercises.json`) y reconstruye las tres copias generadas.
 *
 * Eso solo arregla lo que se pinta desde el catálogo. Las filas de
 * `program_exercises` llevan su propio `exercise_name` copiado, y la migración
 * 1786500000 ya escribió en producción el par `{es,en}` del catálogo VIEJO: hoy
 * hay filas que literalmente valen `{"es":"Plank","en":"Plank"}`. Además la
 * siembra (1786100000) salta ENTERO cualquier programa que ya exista, así que
 * arreglar `programs/*.json` tampoco llega a producción. Hace falta una
 * migración de DATOS: esta.
 *
 * La migración no puede leer `packages/core/data/exercise-catalog.json` (el
 * Dockerfile de producción solo copia `pb_migrations/` y `pb_hooks/`), así que
 * las tablas viajan embebidas, como en 1786100000 y 1786500000.
 *
 * ## Regla
 *
 * Para cada fila se resuelve la entrada del catálogo probando, en orden:
 * `exercise_id` como id o `seed_slug`, el nombre actual como id o `seed_slug`, y
 * por último el nombre actual contra el nombre INGLÉS o el nombre ESPAÑOL VIEJO
 * de las entradas traducidas (sin distinguir mayúsculas ni espacios sobrantes).
 *
 * Y solo se escribe si el `es` ACTUAL de la fila sigue siendo uno de esos dos
 * valores de máquina (el `en` del catálogo o el `es` viejo). Un nombre que haya
 * escrito una persona pasa intacto. `exercise_id` NO se toca nunca: es la clave
 * del historial de series, PRs y `user_program_overrides`.
 *
 * Por lo mismo la migración es idempotente: en la segunda pasada el `es` de la
 * fila ya es la traducción nueva, que no está en la lista de valores aceptados.
 *
 * ## Tabla curada
 *
 * `TRANSLATIONS` es la fuente de verdad de ESTA migración: id del catálogo →
 * `es` VIEJO. El `es` nuevo y el `en` se leen del catálogo ya reconstruido, y el
 * generador comprueba que para cada id el catálogo traiga un `es` distinto del
 * viejo y distinto del `en` (si no, la migración no sería idempotente).
 *
 * Las entradas que se dejaron en inglés a propósito (préstamos asentados en el
 * español de la calistenia: Hollow Body Hold, Dragon Flag, Burpees, Planche
 * Lean, Skin the Cat, Dead Bug, Good Morning, Face Pull, Nordic Curl, Superman,
 * L-sit, Handstand, Bird-Dog, Elbow Lever, Manna) NO están aquí.
 *
 * ## Uso
 *
 *   node scripts/generate-exercise-name-translation-migration.mjs           # regenera
 *   node scripts/generate-exercise-name-translation-migration.mjs --check   # solo comprueba
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
const TARGET = resolve(ROOT, 'pb_migrations/1786700000_translate_program_exercise_names_es.js')

/**
 * id del catálogo → `name.es` VIEJO (el que estaba en inglés y que la migración
 * 1786500000 dejó escrito en las filas de producción). El `es` nuevo sale del
 * catálogo reconstruido, nunca de aquí: así una traducción retocada a mano en
 * las capas de origen se propaga sola al regenerar.
 */
export const TRANSLATIONS = {
  "90_degree_push_up": "90° Push-up",
  ab_wheel_rollout: "Ab Wheel Rollout",
  ankle_mobility: "Ankle Mobility Drill",
  archer2: "Archer Push-up",
  archer_pull_up: "Archer Pull-up",
  arm_circles: "Arm Circles",
  australian_pullup: "Australian Pull-up",
  axe_hold: "High Pull",
  back_extension: "Back Extension (en banco)",
  bear_crawl: "Bear Crawl",
  biceps_curl_cable: "Biceps Curl With Cable",
  body_saw_plank: "Body Saw Plank",
  body_up: "Body-up",
  bottoms_up: "Bottoms-up",
  broad_jump: "Broad Jump",
  bulgarian: "Bulgarian Split Squat",
  butterfly_reverse: "Braced Squat",
  calf_raise: "Calf Raises",
  calf_raises_bilateral: "Calf Raises (bilateral)",
  calf_uni: "Calf Raise Unilateral",
  cat_cow: "Cat-Cow",
  chin_up: "One Arm Triceps Extensions on Cable",
  clamshell: "Clamshell",
  clapping_pushup: "Clapping Push-up",
  close_grip_pullup: "Close Grip Pull-up",
  commando_pullup: "Commando Pull-up",
  copenhagen_plank: "Copenhagen Plank",
  cossack_squat: "Cossack Squat",
  crab_walk: "Crab Walk",
  crow_pose: "Crow Pose / Frog Stand",
  crunch: "Crunch",
  curtsy_lunge: "Curtsy Lunge",
  dead_hang: "Dead Hang",
  decline_pushup: "Decline Push-up",
  deep_hip_mobility: "Hip Mobility Full Routine",
  deficit_calf_raise: "Calf Raise Elevado (déficit)",
  deficit_hspu: "Deficit HSPU",
  depth_jump: "Depth Jump",
  diamond_pushup: "Diamond Push-up",
  donkey_kick: "Donkey Kick",
  dragon_squat: "Dragon Squat",
  elevated_glute_bridge: "Glute Bridge Elevado (pies en banco)",
  facepull: "Long-Pulley (low Row)",
  fire_hydrant: "Fire Hydrant",
  forward_fold: "Seated Forward Fold",
  forward_lunge: "Forward Lunge",
  frog_pump: "Frog Pump",
  front_plate_raise: "Plate twist",
  glute_activation_peak: "Glute Activation Peak",
  glute_bridge: "Glute Bridge",
  glute_bridge_march: "Glute Bridge March",
  glute_bridge_pause: "Glute Bridge con Pausa (3s)",
  glute_bridge_uni: "Glute Bridge Unilateral",
  hanging_knee_raise: "Hanging Knee Raise",
  hanging_leg_raise: "Hanging Leg Raise",
  high_knees: "High Knees",
  hindu_pushup: "Hindu Push-up",
  hindu_squat: "Hindu Squat",
  hip_flexor: "Hip Flexor Stretch (Psoas)",
  hip_flexor_deep: "Hip Flexor 90/90",
  hip_raise_lying: "Leg Raise",
  impossible_dips: "Impossible Dips",
  inchworm: "Inchworm",
  incline_plank_with_alternate_floor_touch: "Ball crunches",
  incline_push_up: "Incline Push-up",
  jump_squat: "Jump Squat",
  jumping_jacks: "Jumping Jacks",
  korean_dips: "Korean Dips",
  landmine_180: "Landmine 180",
  landmine_rotation: "Landmine Rotation",
  lateral_lunge: "Lateral Lunge",
  lateral_raises: "Calf Raises on Hackenschmitt Machine",
  leg_curls_laying: "Chin-ups",
  leg_raises_pull_up_bar: "One armed push-ups",
  leg_swings: "Leg Swings",
  maltese_push_up: "Maltese Push-up",
  mountain_climbers: "Mountain Climbers",
  mountain_climbers_2: "Mountain Climbers",
  neutral_grip_pull_up: "Neutral Grip Pull-up",
  one_arm_actual: "One-Arm Push-up",
  one_arm_prog: "One-Arm Push-up Progresión",
  one_arm_pull_up: "One-Arm Pull-up",
  one_arm_pullup_prog: "One-Arm Pull-up Progresión",
  otis_up: "Otis up",
  pancake_stretch: "Pancake Stretch",
  pigeon: "Pigeon Pose",
  pike_hspu: "Pike HSPU",
  pike_pushup: "Pike Push-up",
  pike_stretch: "Pike Stretch",
  plank: "Plank",
  plank_arm_extension: "Plank con Extensión de Brazo",
  pull_apart: "Towel Pull Apart",
  rear_delt_raises: "Fly With Cable",
  renegade_row: "Renegade Row",
  reverse_bar_curl: "Dumbbells on Scott Machine",
  reverse_lunge: "Reverse Lunge",
  right_levator_scapulae_stretch: "Cat Plank",
  right_neck_stretch: "Pigeon Stretch",
  ring_dip_prog: "Ring Dips (o Dips con peso)",
  ring_dips: "Ring Dips",
  ring_pull_up: "Ring Pull-up",
  ring_row: "Ring Row",
  ring_support: "Ring Support Hold",
  ring_turned_out_support: "Ring Turned Out Support",
  rkc_plank: "Plank RKC",
  russian_twist: "Russian Twist",
  shoulder_dislocates: "Shoulder Dislocates",
  shoulder_shrug: "Tricep Pushdown on Cable",
  shuttle_run: "Shuttle Run",
  side_crow: "Side Crow",
  side_plank: "Side Plank",
  single_rdl: "Single Leg RDL",
  sissy_squat: "Squat Sissy",
  sliding_leg_curl: "Sliding Leg Curl",
  spell_caster: "Spell caster",
  sphinx_pushup: "Sphinx Push-up",
  spiderman_push_up: "Spiderman Push-up",
  staggered_push_up: "Staggered Push-up",
  step_up_2: "Step-up",
  swing_360: "Swing 360",
  t_bar_row: "Inverted Rows",
  thoracic_mobility: "Thoracic Mobility Full",
  thoracic_rotation_side: "Thoracic Rotation (Side-Lying)",
  tibialis_raise: "Tibialis Raise",
  tiger_bend_pushup: "Tiger Bend Push-up",
  towel_pullup: "Towel Pull-up",
  tuck_jumps: "Tuck Jumps",
  tuck_jumps_2: "Tuck Jumps",
  tuck_up: "Tuck-up",
  typewriter_pullup: "Typewriter Pull-up",
  v_ups: "V-ups",
  walking_lunge: "Walking Lunge",
  wall_plank_chest_to_wall: "Wall Plank (pecho a pared)",
  wger_1529: "Toes to bar",
  wide_pullup: "Wide Grip Pull-up",
  wide_pushup: "Wide Push-up",
  windshield_wipers: "Windshield Wipers",
  worlds_stretch: "World's Greatest Stretch",
  wrist_mobility: "Wrist Mobility Routine",
}

/** Normaliza para comparar: sin espacios sobrantes y en minúsculas. */
const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Construye las tablas que viajan embebidas en la migración.
 *
 * - `targets`  id → { es, en } NUEVOS (del catálogo reconstruido)
 * - `slugs`    seed_slug → id, solo de los ids traducidos
 * - `accept`   id → valores `es` de máquina que SÍ se pueden pisar
 * - `byOld`    nombre viejo normalizado (es o en) → id
 *
 * Una clave de `byOld` que reclamen dos ids solo se conserva si ambos apuntan
 * al mismo par `{es,en}` (pasa con los duplicados «Mountain Climbers» y «Tuck
 * Jumps»); si difieren se descarta, para no adivinar.
 */
export function buildMaps(catalog) {
  const byId = {}
  for (const cat of Object.values(catalog.categories ?? {})) {
    for (const ex of cat.exercises ?? []) {
      if (ex?.id && ex.name) byId[ex.id] = ex
    }
  }

  const targets = {}
  const slugs = {}
  const accept = {}
  const claims = new Map() // nombre viejo normalizado → Set<id>

  for (const id of Object.keys(TRANSLATIONS).sort()) {
    const oldEs = TRANSLATIONS[id]
    const ex = byId[id]
    if (!ex) throw new Error(`TRANSLATIONS: «${id}» no está en el catálogo`)
    const es = ex.name.es
    const en = ex.name.en
    if (!es || !en) throw new Error(`TRANSLATIONS: «${id}» no tiene name.es/name.en`)
    if (norm(es) === norm(oldEs)) {
      throw new Error(`TRANSLATIONS: «${id}» sigue con el es viejo (${es}) — ¿falta reconstruir el catálogo?`)
    }
    if (norm(es) === norm(en)) {
      throw new Error(`TRANSLATIONS: «${id}» tiene name.es === name.en (${es}) — no sería idempotente`)
    }

    targets[id] = { es, en }
    if (ex.seed_slug && ex.seed_slug !== id) slugs[ex.seed_slug] = id
    accept[id] = [...new Set([norm(oldEs), norm(en)])]
    for (const key of accept[id]) {
      if (!claims.has(key)) claims.set(key, new Set())
      claims.get(key).add(id)
    }
  }

  const byOld = {}
  const dropped = []
  for (const [key, ids] of claims) {
    const list = [...ids]
    const distinct = new Set(list.map((id) => JSON.stringify(targets[id])))
    if (distinct.size === 1) byOld[key] = list[0]
    else dropped.push(`${key} → ${list.join(', ')}`)
  }

  return { targets, slugs, accept, byOld, dropped }
}

export function renderMigration({ targets, slugs, accept, byOld }) {
  const count = Object.keys(targets).length
  // Un JSON.parse por tabla, cada uno en su línea: para goja una cadena es un
  // nodo de AST trivial (misma razón que en la migración de siembra).
  const lit = (obj) => JSON.stringify(JSON.stringify(obj))

  return `/// <reference path="../pb_data/types.d.ts" />

/**
 * GENERADO por scripts/generate-exercise-name-translation-migration.mjs — no editar a mano.
 *
 * Traduce al español \`program_exercises.exercise_name\` en las filas que se
 * quedaron con el nombre INGLÉS del catálogo. Migración de DATOS: no toca el
 * esquema, solo valores, y es re-ejecutable (la segunda pasada no encuentra
 * nada que traducir).
 *
 * QUÉ ARREGLA (issue #690)
 *
 * El catálogo empaquetado llevaba 133 entradas con \`name.es === name.en\` y otras
 * 49 con un \`es\` claramente inglés, así que la UI en español pintaba «Plank»,
 * «Arm Circles» o «Diamond Push-up». Este PR traduce los nombres en las capas de
 * origen del catálogo, pero eso NO llega a los datos: las filas de
 * \`program_exercises\` llevan su propio \`exercise_name\` copiado, la migración
 * 1786500000 ya escribió ahí el par \`{es,en}\` del catálogo viejo (hoy hay filas
 * que valen \`{"es":"Plank","en":"Plank"}\`) y la siembra (1786100000) salta
 * ENTERO cualquier programa que ya exista. De ahí esta migración.
 *
 * REGLA
 *
 * Se resuelve la entrada del catálogo probando, en orden: \`exercise_id\` como id
 * o \`seed_slug\`, el nombre actual como id o \`seed_slug\`, y por último el nombre
 * actual contra el \`en\` o el \`es\` VIEJO de las entradas traducidas (sin
 * distinguir mayúsculas ni espacios sobrantes).
 *
 * Y solo se escribe si el \`es\` ACTUAL de la fila sigue siendo uno de esos dos
 * valores de máquina. Un nombre escrito por una persona pasa intacto. Las claves
 * extra del json (si las hubiera) se conservan. \`exercise_id\` NO se toca: es la
 * clave del historial de series, PRs y \`user_program_overrides\`.
 *
 * Los préstamos asentados en el español de la calistenia (Hollow Body Hold,
 * Dragon Flag, Burpees, Planche Lean, Skin the Cat, Dead Bug, Good Morning,
 * Face Pull, Nordic Curl, Superman, L-sit, Handstand, Bird-Dog, Elbow Lever,
 * Manna) NO están en la tabla: se quedan como están, a propósito.
 *
 * TODO EN SQL CRUDO, A PROPÓSITO: guardar con la API de records dispararía los
 * hooks de \`program_exercises\` sobre cientos de filas de golpe.
 *
 * Tabla embebida: ${count} ejercicios traducidos.
 */

const TARGETS = JSON.parse(${lit(targets)})
const SLUGS = JSON.parse(${lit(slugs)})
const ACCEPT = JSON.parse(${lit(accept)})
const BY_OLD = JSON.parse(${lit(byOld)})

migrate((app) => {
  const TAG = "[translate_program_exercise_names_es]"

  function norm(value) {
    return String(value === null || value === undefined ? "" : value).trim().toLowerCase()
  }

  function resolveKey(cand) {
    if (!cand) return null
    if (TARGETS[cand]) return cand
    if (SLUGS[cand]) return SLUGS[cand]
    const low = norm(cand)
    if (TARGETS[low]) return low
    if (SLUGS[low]) return SLUGS[low]
    return null
  }

  // \`exercise_name\` es json i18n (\`{"es":"...","en":"..."}\`), pero hubo épocas en
  // que se guardó como cadena plana; se aceptan las dos formas.
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
    const rows = arrayOf(new DynamicModel({ id: "", exercise_id: "", exercise_name: "" }))
    app.db()
      .newQuery("SELECT id, exercise_id, exercise_name FROM program_exercises")
      .all(rows)

    let translated = 0
    let humanKept = 0

    for (const row of rows) {
      const parsed = parseName(row.exercise_name)
      const probeEs = parsed.es.trim()
      const probeEn = parsed.en.trim()

      const key =
        resolveKey(row.exercise_id) ||
        resolveKey(probeEs) ||
        resolveKey(probeEn) ||
        BY_OLD[norm(probeEs)] ||
        BY_OLD[norm(probeEn)] ||
        null
      if (!key) continue

      // Solo se pisa un \`es\` de máquina: el \`en\` del catálogo o el \`es\` viejo.
      const allowed = ACCEPT[key] || []
      if (allowed.indexOf(norm(probeEs)) === -1) {
        if (probeEs) humanKept++
        continue
      }

      const target = TARGETS[key]
      const next = {}
      if (parsed.obj) {
        for (const k in parsed.obj) {
          if (Object.prototype.hasOwnProperty.call(parsed.obj, k)) next[k] = parsed.obj[k]
        }
      }
      next.es = target.es
      next.en = target.en

      const encoded = JSON.stringify(next)
      if (encoded === row.exercise_name) continue

      app.db()
        .newQuery("UPDATE program_exercises SET exercise_name = {:name} WHERE id = {:id}")
        .bind({ name: encoded, id: row.id })
        .execute()
      translated++
    }

    console.log(
      TAG + " " + translated + " filas traducidas de " + rows.length + "; " +
      humanKept + " con nombre no automático que se dejan intactas"
    )
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si esto falla, los
    // nombres se quedan en inglés (feo, no roto). Se reintenta borrando la fila
    // de \`_migrations\` y reiniciando.
    console.log(TAG + " FALLO, nombres sin traducir:", err)
  }
}, (app) => {
  // Sin vuelta atrás: no hay snapshot de los valores previos, y volver a poner
  // el nombre en inglés no arregla nada. Volver a ejecutar es idempotente.
})
`
}

function main() {
  const check = process.argv.includes('--check')
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const maps = buildMaps(catalog)
  if (maps.dropped.length) {
    console.warn(`⚠ ${maps.dropped.length} nombre(s) viejo(s) ambiguo(s) descartado(s):\n  ${maps.dropped.join('\n  ')}`)
  }
  const rendered = renderMigration(maps)

  if (check) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf-8') : ''
    if (current !== rendered) {
      console.error(`✗ ${TARGET} no coincide con el catálogo. Regenera con: node scripts/generate-exercise-name-translation-migration.mjs`)
      process.exit(1)
    }
    console.log('✓ migración de traducción al día')
    return
  }

  writeFileSync(TARGET, rendered, 'utf-8')
  console.log(
    `✓ escrito ${TARGET} (${(rendered.length / 1024).toFixed(0)} KB, ` +
    `${Object.keys(maps.targets).length} ejercicios)`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
