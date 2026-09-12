/// <reference path="../pb_data/types.d.ts" />

/**
 * Segunda pasada de traducción de `program_exercises.exercise_name` (#692,
 * restos de #690). Migración de DATOS, re-ejecutable: la segunda vez no
 * encuentra nada.
 *
 * QUÉ ARREGLA
 *
 * Tras 1786700000 quedaron en producción 15 filas de cinco programas oficiales
 * con `exercise_name.es` en inglés («Skater Jumps», «Sit-up», «Plank Shoulder
 * Taps», «Forward Fold», «Scapular Retraction», «Bodyweight Squat»…). Son
 * huecos con clave de slot (`vie_1_3`) y nombre escrito a mano que no casa con
 * ninguna entrada del catálogo, así que la pasada anterior —que resolvía por
 * catálogo— no pudo tocarlas. Y la siembra (1786100000) salta ENTERO cualquier
 * programa que ya exista: arreglar `programs/*.json` no llega a producción.
 *
 * REGLA
 *
 * Tabla fija «es inglés actual → es español». Solo se escribe si el `es` ACTUAL
 * de la fila es exactamente (sin mayúsculas ni espacios sobrantes) una de las
 * claves; el `en` se conserva si existe y si no se rellena con el inglés. Las
 * claves extra del json se conservan. `exercise_id` NO se toca.
 *
 * Los préstamos asentados en el español de la calistenia (Hollow Body Hold,
 * Hollow Rock, L-sit, Skin the Cat, Dead Bug, Dragon Flag, Nordic Curl,
 * Bird-Dog, Burpees) se dejan a propósito, igual que en la pasada anterior.
 *
 * SQL crudo, como las dos migraciones anteriores: guardar por la API de records
 * dispararía los hooks de `program_exercises`.
 */
migrate((app) => {
  const TAG = "[translate_program_exercise_names_es_pass2]"

  const MAP = {
    "skater jumps": { es: "Saltos de Patinador", en: "Skater Jumps" },
    "sit-up": { es: "Abdominales Sit-up", en: "Sit-up" },
    "sit up": { es: "Abdominales Sit-up", en: "Sit-up" },
    "plank shoulder taps": { es: "Plancha con Toques de Hombro", en: "Plank Shoulder Taps" },
    "forward fold": { es: "Inclinación hacia Delante", en: "Forward Fold" },
    "scapular retraction": { es: "Retracción Escapular", en: "Scapular Retraction" },
    "bodyweight squat": { es: "Sentadilla", en: "Bodyweight Squat" },
    "shrimp squat": { es: "Sentadilla Shrimp", en: "Shrimp Squat" },
    "superman hold": { es: "Superman Isométrico", en: "Superman Hold" },
    "front lever tucked": { es: "Front Lever Agrupado", en: "Front Lever Tucked" },
    "front lever tuck": { es: "Front Lever Agrupado", en: "Front Lever Tuck" },
    "front lever single leg": { es: "Front Lever a Una Pierna", en: "Front Lever Single Leg" },
  }

  function norm(s) {
    return String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase()
  }

  // json i18n (`{"es":"...","en":"..."}`) o cadena plana de épocas viejas.
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
    const rows = arrayOf(new DynamicModel({ id: "", exercise_name: "" }))
    app.db().newQuery("SELECT id, exercise_name FROM program_exercises").all(rows)

    let translated = 0
    const seen = {}

    for (const row of rows) {
      const parsed = parseName(row.exercise_name)
      const target = MAP[norm(parsed.es)]
      if (!target) continue

      const next = {}
      if (parsed.obj) {
        for (const k in parsed.obj) {
          if (Object.prototype.hasOwnProperty.call(parsed.obj, k)) next[k] = parsed.obj[k]
        }
      }
      next.es = target.es
      next.en = parsed.en.trim() || target.en

      const encoded = JSON.stringify(next)
      if (encoded === row.exercise_name) continue

      app.db()
        .newQuery("UPDATE program_exercises SET exercise_name = {:name} WHERE id = {:id}")
        .bind({ name: encoded, id: row.id })
        .execute()
      translated++
      seen[target.es] = (seen[target.es] || 0) + 1
    }

    console.log(TAG + " " + translated + " filas traducidas de " + rows.length + " " + JSON.stringify(seen))
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si esto falla, los
    // nombres se quedan en inglés (feo, no roto).
    console.log(TAG + " FALLO, nombres sin traducir:", err)
  }
}, (app) => {
  // Sin vuelta atrás: no hay snapshot de los valores previos.
})
