/// <reference path="../pb_data/types.d.ts" />

/**
 * Nombres de ejercicio en inglés para «Intermedio – Balance Total» (#847).
 *
 * Los otros 14 programas oficiales viven en `programs/*.json` y llegan a prod
 * por su resiembra (1790430000-1790430011). Balance Total solo existe en la base
 * de datos (pasarlo a JSON es #740), así que aquí se completa el `en` de su
 * `exercise_name` por el nombre en español. Migración de DATOS, re-ejecutable:
 * una fila que ya tiene `en` no se toca, y un nombre fuera del mapa tampoco.
 *
 * SQL crudo, como 1786500000_repair_program_exercise_names.js: guardar con la
 * API de records dispararía los hooks de `program_exercises` fila a fila.
 */
migrate((app) => {
  const TAG = "[1790430012 balance total en]"

  const EN = {
    "Flexiones con pausa en el fondo": "Push-ups with Bottom Pause",
    "Dips en paralelas": "Parallel Bar Dips",
    "Flexiones diamante": "Diamond Push-ups",
    "Flexiones Archer": "Archer Push-ups",
    "Extensión de tríceps con liga": "Band Triceps Extension",
    "Dominadas pronadas (grip ancho)": "Wide-Grip Pull-ups",
    "Chin-ups (supino)": "Chin-ups (supine grip)",
    "Retracción escapular en barra (scapular pull-up)": "Scapular Pull-up",
    "Face pull con liga": "Band Face Pull",
    "Australian pull-up con pausa": "Australian Pull-up with Pause",
    "Sentadilla búlgara": "Bulgarian Split Squat",
    "Pistol squat asistida (con liga o barra)": "Assisted Pistol Squat (band or bar)",
    "Dead bug": "Dead Bug",
    "Bird dog": "Bird Dog",
    "Plancha lateral con rotación": "Side Plank with Rotation",
    "Pike push-up con pies elevados": "Feet-Elevated Pike Push-up",
    "Handstand hold contra pared": "Wall Handstand Hold",
    "Elevación lateral con liga": "Band Lateral Raise",
    "Rotación externa con liga (hombro)": "Band External Rotation (shoulder)",
    "Wall slide (deslizamiento en pared)": "Wall Slide",
    "Dominadas con pausa (agarre neutro o supino)": "Paused Pull-ups (neutral or supine grip)",
    "Muscle up negativo": "Negative Muscle-up",
    "Superman con pausa": "Superman with Pause",
    "Hollow body hold": "Hollow Body Hold",
    "McGill curl-up": "McGill Curl-up",
    "Muscle up con liga (asistido)": "Band-Assisted Muscle-up",
    "Squat jump": "Squat Jump",
    "Movilidad de cadera (world's greatest stretch)": "Hip Mobility (World's Greatest Stretch)",
    "Rotación torácica en el suelo": "Floor Thoracic Rotation",
    "Plancha con desplazamiento (plank walkout)": "Plank Walkout",
    "Flexiones con lastre (mochila)": "Weighted Push-ups (backpack)",
    "Dips en paralelas con lastre": "Weighted Parallel Bar Dips",
    "Pseudo planche push-up": "Pseudo Planche Push-up",
    "Flexiones decline pies elevados": "Feet-Elevated Decline Push-ups",
    "Extensión de tríceps con liga overhead": "Overhead Band Triceps Extension",
    "Dominadas con lastre": "Weighted Pull-ups",
    "Dominadas Arquero": "Archer Pull-ups",
    "Face pull con liga intensidad": "Intense Band Face Pull",
    "Retraccion Y con liga": "Band Y Raise",
    "Curl biceps con liga": "Band Biceps Curl",
    "Pistol squat libre": "Free Pistol Squat",
    "Sentadilla bulgara salto": "Jumping Bulgarian Split Squat",
    "Dead bug lento": "Slow Dead Bug",
    "Bird dog con liga": "Band Bird Dog",
    "Plancha lateral dinámica": "Dynamic Side Plank",
    "HSPU negativo contra pared": "Negative Wall HSPU",
    "Pike push-up rango amplio": "Full-Range Pike Push-up",
    "Press hombros con liga": "Band Shoulder Press",
    "Elevacion lateral liga": "Band Lateral Raise",
    "Wall slide con rotacion": "Wall Slide with Rotation",
    "Dominadas lastre": "Weighted Pull-ups",
    "Muscle up con transicion": "Muscle-up Transition",
    "Superman Y T W": "Superman Y-T-W",
    "Muscle up limpio": "Clean Muscle-up",
    "Rotacion toracica en suelo": "Floor Thoracic Rotation",
    "Cat cow toracico": "Thoracic Cat-Cow",
    "Worlds greatest stretch": "World's Greatest Stretch",
    "Flexiones a una mano asistidas": "Assisted One-Arm Push-ups",
    "Dips paralelas con lastre": "Weighted Parallel Bar Dips",
    "Pseudo planche lean": "Pseudo Planche Lean",
    "Flexiones explosivas con palmada": "Explosive Clap Push-ups",
    "Triceps dip negativo lento": "Slow Negative Triceps Dip",
    "Dominadas a una mano asistidas": "Assisted One-Arm Pull-ups",
    "Muscle up en serie": "Consecutive Muscle-ups",
    "Face pull con liga doble": "Double-Band Face Pull",
    "L-sit en paralelas": "L-sit on Parallettes",
    "Curl biceps negativo lento": "Slow Negative Biceps Curl",
    "Pistol squat en serie": "Consecutive Pistol Squats",
    "Shrimp squat asistido": "Assisted Shrimp Squat",
    "Dragon flag negativo": "Negative Dragon Flag",
    "Hollow body rock": "Hollow Body Rock",
    "McGill curl-up avanzado": "Advanced McGill Curl-up",
    "HSPU completo contra pared": "Full Wall HSPU",
    "Pike push-up deficit con paralelas": "Deficit Pike Push-up on Parallettes",
    "Press hombros con liga pesada": "Heavy Band Shoulder Press",
    "Elevacion lateral excentrica": "Eccentric Lateral Raise",
    "Cuban press con liga": "Band Cuban Press",
    "Dominadas maxima intensidad": "Max-Intensity Pull-ups",
    "Front lever negativo": "Negative Front Lever",
    "Superman Y T W avanzado": "Advanced Superman Y-T-W",
    "Dragon flag negativo con pausa": "Negative Dragon Flag with Pause",
    "Hollow body hold maximo": "Max Hollow Body Hold",
    "Muscle up en serie maximo": "Max Consecutive Muscle-ups",
    "Pistol squat con lastre": "Weighted Pistol Squat",
    "Rotacion toracica profunda": "Deep Thoracic Rotation",
    "Worlds greatest stretch avanzado": "Advanced World's Greatest Stretch",
    "Tuck planche hold": "Tuck Planche Hold",
  }

  try {
    const rows = arrayOf(new DynamicModel({ id: "", exercise_name: "" }))
    app.db()
      .newQuery(
        "SELECT pe.id AS id, pe.exercise_name AS exercise_name FROM program_exercises pe " +
        "JOIN programs p ON p.id = pe.program WHERE p.slug = 'intermedio-balance-total'"
      )
      .all(rows)

    let fixed = 0
    const missing = []
    for (const row of rows) {
      let value = row.exercise_name
      try { value = JSON.parse(row.exercise_name) } catch (e) { /* cadena plana */ }
      if (!value || typeof value !== "object") value = { es: String(value || "") }
      if (String(value.en || "").trim()) continue
      const es = String(value.es || "").trim()
      const en = EN[es]
      if (!en) {
        if (es && missing.indexOf(es) === -1) missing.push(es)
        continue
      }
      app.db()
        .newQuery("UPDATE program_exercises SET exercise_name = {:name} WHERE id = {:id}")
        .bind({ name: JSON.stringify({ es: es, en: en }), id: row.id })
        .execute()
      fixed++
    }
    console.log(TAG + " " + fixed + " de " + rows.length + " filas con nombre en inglés" +
      (missing.length ? "; sin traducción: " + missing.join(", ") : ""))
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar; si falla, los
    // nombres siguen en español como hasta hoy.
    console.log(TAG + " FALLO:", err)
  }
}, (app) => {
  // Sin vuelta atrás: añadir `en` nunca empeora el dato.
})
