/// <reference path="../pb_data/types.d.ts" />

/**
 * Repara los ejercicios sostenidos de `program_exercises` (issue #690).
 *
 * Migración de DATOS: no toca el esquema, solo valores, y es re-ejecutable (la
 * segunda pasada no encuentra nada que reparar).
 *
 * QUÉ ARREGLA
 *
 * (a) TEMPORIZADORES. Decenas de filas se sembraron con la duración escrita en
 *     `reps` («30-45 seg») pero con `is_timer:false` y `timer_seconds:0`. La
 *     pantalla de sesión solo pinta la cuenta atrás cuando `is_timer` es true,
 *     así que el usuario leía «30-45 seg» y no tenía ningún temporizador que
 *     arrancar: la plancha se hacía a ojo. 60 filas en producción (medido el 2026-09-02; otras 8 con «6x10s hold» o notas de tempo se dejan a propósito), repartidas
 *     por 11 de los 15 programas oficiales (y sus copias de usuario).
 *
 * (b) MÚSCULOS. Otras filas llevan tokens de máquina en `muscles` («core,
 *     anterior_core, shoulders») que la ficha del ejercicio enseña tal cual.
 *
 * El PR arregla también `programs/*.json`, pero la siembra (1786100000) SALTA
 * los programas que ya existen: sin esta migración de datos, producción y las
 * copias que `duplicateProgram` ya hizo se quedan con el dato viejo para
 * siempre.
 *
 * REGLA (espejo literal de scripts/repair-program-timers-muscles.mjs; el JSVM
 * de PocketBase no puede importar módulos, y
 * scripts/check-program-content.test.mjs comprueba que las dos copias no se
 * separan)
 *
 * (a) Solo una duración PURA enciende el temporizador: un número o un rango,
 *     una unidad de tiempo y, como mucho, un «por lado». De un rango se coge el
 *     extremo ALTO, porque el temporizador marca el objetivo. Se quedan como
 *     están «6x10s hold» (seis repeticiones de diez segundos), «3-5 (descenso
 *     lento 3-4s)» y «10 (3s arriba)» (repeticiones con tempo), y «10m
 *     ida/vuelta» (metros). `reps` NO se reescribe: es el objetivo que se pinta
 *     al lado de la cuenta atrás. `timer_seconds` solo se rellena si está a
 *     0/nulo, y una fila que ya tenga `is_timer:true` no se toca.
 *
 * (b) Un texto de músculos se traduce entero o no se traduce: si algún token se
 *     sale del diccionario, la fila queda intacta y se registra. Media
 *     traducción («Core, shoulders») es peor que el dato original. El texto
 *     escrito por una persona pasa intacto: «core», «cardiovascular» y
 *     «balance» se escriben igual en español y NO disparan nada por sí solos.
 *
 * `exercise_id` y `exercise_name` NO se tocan: son la clave del historial de
 * series, los PRs y `user_program_overrides`.
 *
 * TODO EN SQL CRUDO, A PROPÓSITO: guardar con la API de records dispararía los
 * hooks de `program_exercises` sobre cientos de filas de golpe.
 */

migrate((app) => {
  const TAG = "[repair_program_exercise_timers_muscles]"

  // ── (a) Duración pura ──────────────────────────────────────────────────────
  const PURE_DURATION_RE =
    /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|seg|segs|sec|secs|segundos|min|mins|minutos)\b\s*(?:(?:por|cada|c\/|\/)?\s*lado|each side|per side)?\s*$/i

  function inferTimerFromReps(reps) {
    const m = PURE_DURATION_RE.exec(String(reps == null ? "" : reps).trim())
    if (!m) return null
    const factor = m[3].toLowerCase().indexOf("min") === 0 ? 60 : 1
    const upper = Number(m[2] == null ? m[1] : m[2])
    if (!isFinite(upper) || upper <= 0) return null
    return upper * factor
  }

  // ── (b) Diccionario de músculos ────────────────────────────────────────────
  const MUSCLE_TOKENS = {
    abductors: { es: "Abductores", en: "Abductors" },
    abs: { es: "Abdomen", en: "Abs" },
    adductors: { es: "Aductores", en: "Adductors" },
    ankles: { es: "Tobillos", en: "Ankles" },
    anterior_core: { es: "Core anterior", en: "Anterior core" },
    arms: { es: "Brazos", en: "Arms" },
    back: { es: "Espalda", en: "Back" },
    balance: { es: "Equilibrio", en: "Balance" },
    biceps: { es: "Bíceps", en: "Biceps" },
    calves: { es: "Gemelos", en: "Calves" },
    cardio: { es: "Cardio", en: "Cardio" },
    cardiovascular: { es: "Cardiovascular", en: "Cardiovascular" },
    chest: { es: "Pecho", en: "Chest" },
    core: { es: "Core", en: "Core" },
    forearms: { es: "Antebrazos", en: "Forearms" },
    full_body: { es: "Cuerpo completo", en: "Full body" },
    glutes: { es: "Glúteos", en: "Glutes" },
    grip: { es: "Agarre", en: "Grip" },
    hamstrings: { es: "Isquiotibiales", en: "Hamstrings" },
    hip_flexors: { es: "Flexores de cadera", en: "Hip flexors" },
    hips: { es: "Caderas", en: "Hips" },
    lats: { es: "Dorsales", en: "Lats" },
    legs: { es: "Piernas", en: "Legs" },
    lower_back: { es: "Lumbar", en: "Lower back" },
    mobility: { es: "Movilidad", en: "Mobility" },
    neck: { es: "Cuello", en: "Neck" },
    obliques: { es: "Oblicuos", en: "Obliques" },
    posterior_chain: { es: "Cadena posterior", en: "Posterior chain" },
    quads: { es: "Cuádriceps", en: "Quads" },
    rear_delts: { es: "Deltoides posterior", en: "Rear delts" },
    rotator_cuff: { es: "Manguito rotador", en: "Rotator cuff" },
    scapula: { es: "Escápulas", en: "Scapula" },
    serratus: { es: "Serrato", en: "Serratus" },
    shoulders: { es: "Hombros", en: "Shoulders" },
    spine: { es: "Columna", en: "Spine" },
    thoracic: { es: "Columna torácica", en: "Thoracic" },
    traps: { es: "Trapecio", en: "Traps" },
    triceps: { es: "Tríceps", en: "Triceps" },
    upper_back: { es: "Espalda alta", en: "Upper back" },
    wrists: { es: "Muñecas", en: "Wrists" },
  }

  const ENGLISH_ONLY_TOKENS = {}
  const ENGLISH_ONLY_LIST = [
    "abductors", "abs", "adductors", "ankles", "arms", "back", "biceps",
    "calves", "chest", "forearms", "glutes", "grip", "hamstrings", "hips",
    "lats", "legs", "mobility", "neck", "obliques", "quads", "scapula",
    "serratus", "shoulders", "spine", "thoracic", "traps", "triceps", "wrists",
  ]
  for (let i = 0; i < ENGLISH_ONLY_LIST.length; i++) ENGLISH_ONLY_TOKENS[ENGLISH_ONLY_LIST[i]] = true

  function splitMuscleTokens(text) {
    const out = []
    const parts = String(text == null ? "" : text).split(/\s*,\s*/)
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i].trim().toLowerCase()
      if (!t) continue
      if (MUSCLE_TOKENS[t]) { out.push(t); continue }
      const words = t.split(/\s+/)
      for (let j = 0; j < words.length; j++) if (words[j]) out.push(words[j])
    }
    return out
  }

  // Dos puertas, las dos conservadoras: (1) un guion bajo no lo escribe una
  // persona; (2) si no lo hay, TODOS los tokens tienen que estar en el
  // diccionario Y al menos uno ser inequívocamente inglés. El «todos» deja en
  // paz el texto humano mezclado («Espalda, lats»); el «al menos uno» deja en
  // paz lo ambiguo («core», «core, balance»).
  function needsMuscleRepair(text) {
    const raw = String(text == null ? "" : text).trim()
    if (!raw) return false
    if (raw.indexOf("_") !== -1) return true
    const tokens = splitMuscleTokens(raw)
    if (!tokens.length) return false
    for (let i = 0; i < tokens.length; i++) if (!MUSCLE_TOKENS[tokens[i]]) return false
    for (let i = 0; i < tokens.length; i++) if (ENGLISH_ONLY_TOKENS[tokens[i]]) return true
    return false
  }

  function repairMusclesText(text) {
    if (!needsMuscleRepair(text)) return null
    const tokens = splitMuscleTokens(text)
    const es = []
    const en = []
    for (let i = 0; i < tokens.length; i++) {
      const hit = MUSCLE_TOKENS[tokens[i]]
      if (!hit) return null // token desconocido → fila entera intacta
      es.push(hit.es)
      en.push(hit.en)
    }
    if (!es.length) return null
    return { es: es.join(", "), en: en.join(", ") }
  }

  function unknownMuscleTokens(text) {
    const seen = {}
    const out = []
    const tokens = splitMuscleTokens(text)
    for (let i = 0; i < tokens.length; i++) {
      if (!MUSCLE_TOKENS[tokens[i]] && !seen[tokens[i]]) { seen[tokens[i]] = true; out.push(tokens[i]) }
    }
    return out
  }

  // `muscles` es json i18n (`{"es":"...","en":"..."}`), pero hubo épocas en que
  // se guardó como cadena plana; se aceptan las dos formas.
  function textOf(raw) {
    if (!raw) return ""
    let value = raw
    try { value = JSON.parse(raw) } catch (e) { value = raw }
    if (value && typeof value === "object") return String(value.es || value.en || "").trim()
    return String(value).trim()
  }

  try {
    const rows = arrayOf(new DynamicModel({
      id: "",
      reps: "",
      is_timer: false,
      timer_seconds: 0,
      muscles: "",
    }))
    app.db()
      .newQuery("SELECT id, reps, is_timer, timer_seconds, muscles FROM program_exercises")
      .all(rows)

    let timers = 0
    let muscles = 0
    let skipped = 0
    const samples = []

    for (const row of rows) {
      if (!row.is_timer) {
        const seconds = inferTimerFromReps(row.reps)
        if (seconds !== null) {
          // `timer_seconds` puesto a mano gana: solo se rellena el 0/nulo.
          const next = row.timer_seconds ? row.timer_seconds : seconds
          app.db()
            .newQuery("UPDATE program_exercises SET is_timer = 1, timer_seconds = {:secs} WHERE id = {:id}")
            .bind({ secs: next, id: row.id })
            .execute()
          timers++
        }
      }

      const probe = textOf(row.muscles)
      if (needsMuscleRepair(probe)) {
        const fixed = repairMusclesText(probe)
        if (!fixed) {
          skipped++
          const unknown = unknownMuscleTokens(probe).join("/")
          if (samples.length < 20 && samples.indexOf(unknown) === -1) samples.push(unknown)
        } else {
          const next = JSON.stringify(fixed)
          if (next !== row.muscles) {
            app.db()
              .newQuery("UPDATE program_exercises SET muscles = {:muscles} WHERE id = {:id}")
              .bind({ muscles: next, id: row.id })
              .execute()
            muscles++
          }
        }
      }
    }

    console.log(
      TAG + " " + timers + " temporizadores encendidos y " + muscles +
      " textos de músculos traducidos de " + rows.length + " filas; " +
      skipped + " filas con tokens fuera del diccionario" +
      (samples.length ? " (p.ej. " + samples.join(", ") + ")" : "")
    )
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si esto falla, los
    // datos se quedan como hoy (la sesión sigue enseñando el texto de `reps`).
    // Se reintenta borrando la fila de `_migrations` y reiniciando.
    console.log(TAG + " FALLO, temporizadores y músculos sin reparar:", err)
  }
}, (app) => {
  // Sin vuelta atrás: no hay snapshot de los valores previos, y ni un
  // temporizador encendido ni un músculo en español son peores que el dato de
  // partida. Volver a ejecutar es idempotente.
})
