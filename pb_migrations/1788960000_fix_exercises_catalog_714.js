/// <reference path="../pb_data/types.d.ts" />

/**
 * Migración de DATOS para `exercises_catalog` (issue #714).
 *
 * El catálogo empaquetado (`packages/core/data/exercise-catalog.json`) ya
 * trae estas correcciones, pero PB solo tiene un ESPEJO parcial de ese
 * catálogo en `exercises_catalog`: 263 filas `source='catalog'` (sembradas
 * desde `seeds/exercises/*.json`, cuyo `slug` es el slug del seed con
 * guiones, p. ej. `chin-up`) y 1271 filas `source='exercisedb'` (cuyo
 * `slug` es el id del catálogo con guiones bajos, p. ej.
 * `scapular_pull_up`). Corregir el JSON del árbol no reescribe lo que ya
 * está sembrado en la base — de ahí esta migración.
 *
 * Por qué SQL crudo: `app.findRecordsByFilter`/`save()` disparan hooks de
 * la colección (incluida la traducción/normalización que corre en otros
 * puntos del sistema), lo que puede pisar estos valores o efectos
 * colaterales no deseados. Se usa `app.db().newQuery(...)` con parámetros
 * ligados y los JSON ya serializados con `JSON.stringify` — el JSVM de PB
 * (goja) falla EN SILENCIO con la API de records si algo no casa.
 *
 * Idempotente: los UPDATE solo tocan filas cuyo `slug` coincide (0 filas
 * si el slug no existe, sin error) y los INSERT llevan una guarda
 * `WHERE NOT EXISTS (SELECT 1 FROM exercises_catalog WHERE slug = ...)`.
 * Reaplicar la migración no duplica ni cambia nada.
 *
 * Vocabulario de `equipment` (dos vocabularios distintos según la fuente,
 * no mezclar):
 *   - filas `source='catalog'`: claves del seed tal cual (`pull_up_bar`,
 *     `bench`, `rings`, `resistance_band`, y las que ya son canónicas en
 *     español: `kettlebell`, `rueda_abdominal`).
 *   - filas `source='exercisedb'`: ids canónicos en español (`ninguno`,
 *     `polea`, `mancuernas`, `barra_dominadas`, `trx`).
 *
 * Para añadir más filas en el futuro, basta con añadir entradas a UPDATES
 * o INSERTS más abajo — la lógica de aplicación no cambia.
 */

// ---------------------------------------------------------------------------
// UPDATES: correcciones de campos sobre filas ya existentes, por `slug`.
// ---------------------------------------------------------------------------
const UPDATES = [
  {
    slug: "ab-wheel-rollout",
    source: "catalog",
    fields: {
      equipment: ["rueda_abdominal"],
    },
  },
  {
    slug: "goblet-squat",
    source: "catalog",
    fields: {
      equipment: ["kettlebell"],
      description: {
        es: "Sentadilla sosteniendo una kettlebell o una mancuerna frente al pecho. La posición del peso ayuda a mantener el torso erguido y mejorar la profundidad.",
        en: "Squat holding a kettlebell or a dumbbell at chest height. The front-loaded position helps keep your torso upright and improve depth.",
      },
    },
  },
  {
    slug: "freestanding-handstand-attempts",
    source: "catalog",
    fields: {
      is_timer: true,
      default_timer_seconds: 10,
      default_reps: "5-15s",
    },
  },
  {
    slug: "scapular_pull_up",
    source: "exercisedb",
    fields: {
      equipment: ["barra_dominadas"],
    },
  },
  {
    slug: "suspended_row",
    source: "exercisedb",
    fields: {
      equipment: ["trx"],
    },
  },
  {
    slug: "bodyweight_standing_row",
    source: "exercisedb",
    fields: {
      equipment: ["polea"],
    },
  },
  {
    slug: "bodyweight_standing_one_arm_row",
    source: "exercisedb",
    fields: {
      equipment: ["mancuernas"],
    },
  },
  // Barrido de material de #714: 453 entradas «ninguno» revisadas contra su
  // nombre/descripción; estas exigen el material de forma literal. Las filas
  // wger y las locales sin seed no viven en PB, por eso no aparecen aquí.
  {
    slug: "arm_slingers_hanging_bent_knee_legs",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "arm_slingers_hanging_straight_legs",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "bench_pull_ups",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "biceps_narrow_pull_ups",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "biceps_pull_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "chin_ups_narrow_parallel_grip",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "close_grip_chin_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "front_lever_reps",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "gironda_sternum_chin",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "gorilla_chin",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "hanging_leg_hip_raise",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "hanging_pike",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "hanging_straight_leg_hip_raise",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "hanging_straight_leg_raise",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "hanging_straight_twisting_leg_hip_raise",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "kipping_muscle_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "l_pull_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "mixed_grip_chin_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "muscle_up_on_vertical_bar",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "one_arm_chin_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "rear_pull_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "reverse_grip_pull_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "rocky_pull_up_pulldown",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "shoulder_grip_pull_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "side_to_side_chin",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "suspended_reverse_crunch",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "wide_grip_rear_pull_up",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "inverted_row",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "inverted_row_bent_knees",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "chest_dip_on_straight_bar",
    source: "exercisedb",
    fields: { equipment: ["barra_dominadas"] },
  },
  {
    slug: "bodyweight_standing_close_grip_row",
    source: "exercisedb",
    fields: { equipment: ["polea"] },
  },
  {
    slug: "biceps_leg_concentration_curl",
    source: "exercisedb",
    fields: { equipment: ["mancuernas"] },
  },
  {
    slug: "bodyweight_standing_close_grip_one_arm_row",
    source: "exercisedb",
    fields: { equipment: ["mancuernas"] },
  },
  {
    slug: "bench_dip_knees_bent",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "bench_hip_extension",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "body_up",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "decline_crunch",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "decline_sit_up",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "elbow_dips",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "glute_bridge_two_legs_on_bench_male",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "hyperextension",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "hyperextension_on_bench",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "incline_close_grip_push_up",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "incline_leg_hip_raise_leg_straight",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "incline_push_up_depth_jump",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "incline_reverse_grip_push_up",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "incline_scapula_push_up",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "incline_twisting_sit_up",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "inverse_leg_curl_bench_support",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "inverted_row_on_bench",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "kick_out_sit",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "leg_pull_in_flat_bench",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "lying_leg_raise_flat_bench",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "one_arm_dip",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "reverse_hyper_on_flat_bench",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "seated_calf_stretch_male",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "seated_leg_raise",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "three_bench_dip",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "triceps_dip_bench_leg",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "triceps_dip_between_benches",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "triceps_dips_floor",
    source: "exercisedb",
    fields: { equipment: ["banco"] },
  },
  {
    slug: "chest_dip",
    source: "exercisedb",
    fields: { equipment: ["paralelas"] },
  },
  {
    slug: "chest_dip_on_dip_pull_up_cage",
    source: "exercisedb",
    fields: { equipment: ["paralelas"] },
  },
  {
    slug: "reverse_dip",
    source: "exercisedb",
    fields: { equipment: ["paralelas"] },
  },
  {
    slug: "side_hip_on_parallel_bars",
    source: "exercisedb",
    fields: { equipment: ["paralelas"] },
  },
  {
    slug: "vertical_leg_raise_on_parallel_bars",
    source: "exercisedb",
    fields: { equipment: ["paralelas"] },
  },
  {
    slug: "wide_grip_chest_dip_on_high_parallel_bars",
    source: "exercisedb",
    fields: { equipment: ["paralelas"] },
  },
  {
    slug: "glute_ham_raise",
    source: "exercisedb",
    fields: { equipment: ["maquina"] },
  },
  {
    slug: "inverse_leg_curl_on_pull_up_cable_machine",
    source: "exercisedb",
    fields: { equipment: ["maquina"] },
  },
  {
    slug: "inverted_row_v_2",
    source: "exercisedb",
    fields: { equipment: ["maquina"] },
  },
  {
    slug: "inverted_row_with_straps",
    source: "exercisedb",
    fields: { equipment: ["trx"] },
  },
  {
    slug: "suspended_abdominal_fallout",
    source: "exercisedb",
    fields: { equipment: ["trx"] },
  },
  {
    slug: "suspended_push_up",
    source: "exercisedb",
    fields: { equipment: ["trx"] },
  },
  {
    slug: "suspended_split_squat",
    source: "exercisedb",
    fields: { equipment: ["trx"] },
  },
  {
    slug: "bodyweight_squatting_row_with_towel",
    source: "exercisedb",
    fields: { equipment: ["toalla"] },
  },
  {
    slug: "bodyweight_standing_one_arm_row_with_towel",
    source: "exercisedb",
    fields: { equipment: ["toalla"] },
  },
  {
    slug: "bodyweight_standing_row_with_towel",
    source: "exercisedb",
    fields: { equipment: ["toalla"] },
  },
  {
    slug: "one_arm_towel_row",
    source: "exercisedb",
    fields: { equipment: ["toalla"] },
  },
  {
    slug: "bodyweight_standing_calf_raise",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "calf_push_stretch_with_hands_against_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "calf_stretch_with_hands_against_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "high_knee_against_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "march_sit_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "one_arm_against_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "one_leg_donkey_calf_raise",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "one_leg_floor_calf_raise",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "potty_squat_with_support",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "push_up_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "push_up_wall_v_2",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "seated_side_crunch_wall",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "side_lying_floor_stretch",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "standing_calves_calf_stretch",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "standing_pelvic_tilt",
    source: "exercisedb",
    fields: { equipment: ["pared"] },
  },
  {
    slug: "box_jump_down_with_one_leg_stabilization",
    source: "exercisedb",
    fields: { equipment: ["escalon"] },
  },
  {
    slug: "incline_push_up_on_box",
    source: "exercisedb",
    fields: { equipment: ["escalon"] },
  },
  {
    slug: "monster_walk",
    source: "exercisedb",
    fields: { equipment: ["banda_elastica"] },
  },
  {
    slug: "straddle_maltese",
    source: "exercisedb",
    fields: { equipment: ["anillas"] },
  },
  {
    slug: "wheel_run",
    source: "exercisedb",
    fields: { equipment: ["rodillo"] },
  },
  {
    slug: "balance_board",
    source: "exercisedb",
    fields: { equipment: ["otro"] },
  },
  {
    slug: "donkey_calf_raise",
    source: "exercisedb",
    fields: { equipment: ["escalon","pared"] },
  },
  {
    slug: "standing_calf_raise_on_a_staircase",
    source: "exercisedb",
    fields: { equipment: ["escalon","pared"] },
  },
  {
    slug: "maltese-push-up",
    source: "catalog",
    fields: { equipment: ["rings"] },
  },
  {
    slug: "standing-ab-wheel-rollout",
    source: "catalog",
    fields: { equipment: ["rueda_abdominal"] },
  },
]

// ---------------------------------------------------------------------------
// INSERTS: filas nuevas, copiadas EXACTAS de los seeds correspondientes.
// Solo se insertan si el `slug` no existe todavía en `exercises_catalog`.
// ---------------------------------------------------------------------------
const INSERTS = [
  {
    // seeds/exercises/skills.json → subcategoría "other-skills"
    slug: "german-hang",
    name: { es: "German Hang (colgado invertido)", en: "German Hang" },
    description: {
      es: "Colgado de la barra, pasa las piernas por dentro de los brazos hasta quedar colgando boca abajo con los hombros en extensión máxima y los brazos rectos detrás del cuerpo. Aguanta la posición respirando. Escalón previo a skin the cat y al back lever.",
      en: "Hanging from the bar, bring your legs through your arms until you hang upside down with the shoulders in full extension and straight arms behind the body. Hold the position while breathing. Prerequisite for skin the cat and the back lever.",
    },
    muscles: { es: "Hombros, pecho, bíceps (movilidad)", en: "Shoulders, chest, biceps (mobility)" },
    note: { es: "", en: "" },
    category: "skills",
    difficulty_level: "intermediate",
    equipment: ["pull_up_bar"],
    is_timer: true,
    default_sets: 3,
    default_reps: "10-20s",
    default_rest_seconds: 90,
    default_timer_seconds: 15,
    priority: "secondary",
    source: "catalog",
    status: "official",
  },
  {
    // seeds/exercises/pull.json → subcategoría "muscle-ups"
    slug: "false-grip-hang",
    name: { es: "Colgado en Agarre Falso", en: "False Grip Hang" },
    description: {
      es: "Cuélgate de la barra o las anillas con la muñeca por encima del agarre, apoyando el talón de la mano sobre él (agarre falso). Mantén los brazos rectos y el cuerpo quieto. Base del muscle-up estricto: enseña a la muñeca a soportar la transición.",
      en: "Hang from the bar or rings with the wrist over the grip, resting the heel of the hand on it (false grip). Keep the arms straight and the body still. Foundation of the strict muscle-up: it teaches the wrist to bear the transition.",
    },
    muscles: { es: "Antebrazos, agarre, dorsal", en: "Forearms, grip, lats" },
    note: { es: "", en: "" },
    category: "pull",
    difficulty_level: "beginner",
    equipment: ["pull_up_bar"],
    is_timer: true,
    default_sets: 3,
    default_reps: "15-30s",
    default_rest_seconds: 90,
    default_timer_seconds: 20,
    priority: "secondary",
    source: "catalog",
    status: "official",
  },
  {
    // seeds/exercises/pull.json → subcategoría "muscle-ups"
    slug: "false-grip-row",
    name: { es: "Remo en Agarre Falso", en: "False Grip Row" },
    description: {
      es: "Remo invertido con la barra baja o las anillas, sujetando con agarre falso (muñeca por encima del agarre). Tira hasta que el pecho toque las manos manteniendo las muñecas dobladas todo el recorrido. Escalón entre el colgado en agarre falso y el muscle-up negativo.",
      en: "Inverted row on a low bar or rings holding a false grip (wrist over the grip). Pull until the chest touches the hands keeping the wrists bent through the whole range. Step between the false grip hang and the negative muscle-up.",
    },
    muscles: { es: "Dorsal, bíceps, antebrazos", en: "Lats, biceps, forearms" },
    note: { es: "", en: "" },
    category: "pull",
    difficulty_level: "intermediate",
    equipment: ["pull_up_bar"],
    is_timer: false,
    default_sets: 3,
    default_reps: "6-10",
    default_rest_seconds: 90,
    default_timer_seconds: 0,
    priority: "secondary",
    source: "catalog",
    status: "official",
  },
]

// Campos que se guardan como JSON (texto) en la fila.
const JSON_FIELDS = { equipment: true, description: true, name: true, muscles: true, note: true, tempo: true }

// Hash determinista (FNV-1a, sin dependencias) para derivar el id de 15
// caracteres [a-z0-9] de una fila nueva a partir de su slug. No hace falta
// que sea criptográfico: solo que sea estable entre ejecuciones para que la
// migración sea reproducible.
function deterministicId(seed) {
  function fnv1a(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
  }
  let out = ""
  let salt = 0
  while (out.length < 15) {
    out += fnv1a("exercises_catalog#714#" + seed + "#" + salt)
    salt++
  }
  return out.slice(0, 15)
}

migrate((app) => {
  const TAG = "[fix_exercises_catalog_714]"

  // --- UPDATES --------------------------------------------------------
  for (const u of UPDATES) {
    const setParts = []
    const params = { slug: u.slug }
    let i = 0
    for (const key in u.fields) {
      if (!Object.prototype.hasOwnProperty.call(u.fields, key)) continue
      const paramName = "p" + i
      i++
      const raw = u.fields[key]
      let value
      if (JSON_FIELDS[key]) {
        value = JSON.stringify(raw)
      } else if (typeof raw === "boolean") {
        value = raw ? 1 : 0
      } else {
        value = raw
      }
      setParts.push(key + " = {:" + paramName + "}")
      params[paramName] = value
    }

    // Se identifican las filas por id ANTES de tocarlas, para poder loguear
    // cuántas se encontraron y evitar depender de RowsAffected() (no
    // expuesto de forma fiable al JSVM).
    const found = arrayOf(new DynamicModel({ id: "" }))
    app.db().newQuery("SELECT id FROM exercises_catalog WHERE slug = {:slug}").bind({ slug: u.slug }).all(found)

    if (found.length === 0) {
      console.log(TAG + " UPDATE " + u.slug + " (" + u.source + "): 0 filas (slug no encontrado)")
      continue
    }

    const sql = "UPDATE exercises_catalog SET " + setParts.join(", ") + " WHERE slug = {:slug}"
    app.db().newQuery(sql).bind(params).execute()
    console.log(TAG + " UPDATE " + u.slug + " (" + u.source + "): " + found.length + " fila(s)")
  }

  // --- INSERTS ----------------------------------------------------------
  for (const row of INSERTS) {
    const existing = arrayOf(new DynamicModel({ id: "" }))
    app.db().newQuery("SELECT id FROM exercises_catalog WHERE slug = {:slug}").bind({ slug: row.slug }).all(existing)

    if (existing.length > 0) {
      console.log(TAG + " INSERT " + row.slug + ": ya existe (" + existing.length + " fila), se omite")
      continue
    }

    const id = deterministicId(row.slug)
    app
      .db()
      .newQuery(
        "INSERT INTO exercises_catalog (" +
          "id, slug, name, description, muscles, note, category, difficulty_level, equipment, " +
          "is_timer, default_sets, default_reps, default_rest_seconds, default_timer_seconds, " +
          "priority, source, status, created_by, variant_of, promoted_from, youtube, " +
          "default_images, default_video, tempo, wger_id, wger_language, " +
          "media_sequence, media_muscles, media_thumbnail" +
          ") VALUES (" +
          "{:id}, {:slug}, {:name}, {:description}, {:muscles}, {:note}, {:category}, {:difficulty_level}, {:equipment}, " +
          "{:is_timer}, {:default_sets}, {:default_reps}, {:default_rest_seconds}, {:default_timer_seconds}, " +
          "{:priority}, {:source}, {:status}, '', '', '', ''," +
          " '[]', '', NULL, 0, ''," +
          " '', '', ''" +
          ")"
      )
      .bind({
        id: id,
        slug: row.slug,
        name: JSON.stringify(row.name),
        description: JSON.stringify(row.description),
        muscles: JSON.stringify(row.muscles),
        note: JSON.stringify(row.note),
        category: row.category,
        difficulty_level: row.difficulty_level,
        equipment: JSON.stringify(row.equipment),
        is_timer: row.is_timer ? 1 : 0,
        default_sets: row.default_sets,
        default_reps: row.default_reps,
        default_rest_seconds: row.default_rest_seconds,
        default_timer_seconds: row.default_timer_seconds,
        priority: row.priority,
        source: row.source,
        status: row.status,
      })
      .execute()

    console.log(TAG + " INSERT " + row.slug + ": creada con id " + id)
  }
}, (app) => {
  // Sin vuelta atrás: quitar las filas insertadas podría borrar referencias
  // creadas después (programas, sesiones) y revertir los UPDATE no tiene un
  // valor "anterior" fiable que restaurar (no hay snapshot). Re-aplicar la
  // migración hacia adelante es idempotente y es la vía de recuperación.
})
