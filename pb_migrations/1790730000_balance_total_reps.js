/// <reference path="../pb_data/types.d.ts" />

/**
 * «Intermedio – Balance Total»: 4 filas con las series repetidas en `reps` (#889).
 *
 * El inicio pinta `${sets} × ${reps}`, así que `sets=3` con `reps="3×20s"` salía
 * «3 × 3×20s». Las notas de cada fila dicen lo que significa:
 *
 *   - Handstand hold contra pared: 3 series de 20 s (ya es cronómetro de 20 s).
 *   - McGill curl-up: 3 series de 5 / 6 / 8 repeticiones aguantando 10 s cada
 *     una. Se escribe como «3 (descenso 4 s)» de los programas de `programs/`,
 *     y `localizeReps` lo pinta «5 (10 s each)» en inglés.
 *
 * Balance Total solo vive en la base de datos (pasarlo a JSON es #740), así que
 * el arreglo es una migración de DATOS. Re-ejecutable: solo toca una fila si
 * aún tiene el valor roto, así que no pisa una edición posterior. SQL crudo,
 * como 1790430012: guardar con la API de records dispararía los hooks de
 * `program_exercises` fila a fila.
 */
migrate((app) => {
  const TAG = "[1790730000 balance total reps]"

  const FIXES = [
    { phase: 1, day: "jue", from: "3×20s", to: "20 s" },
    { phase: 1, day: "vie", from: "5 × 10s hold", to: "5 (10 s cada una)" },
    { phase: 2, day: "vie", from: "6x10s hold", to: "6 (10 s cada una)" },
    { phase: 3, day: "mie", from: "8x10s hold", to: "8 (10 s cada una)" },
  ]

  try {
    let fixed = 0
    for (const f of FIXES) {
      const res = app.db()
        .newQuery(
          "UPDATE program_exercises SET reps = {:to} WHERE reps = {:from} " +
          "AND phase_number = {:phase} AND day_id = {:day} AND program IN " +
          "(SELECT id FROM programs WHERE slug = 'intermedio-balance-total')"
        )
        .bind({ to: f.to, from: f.from, phase: f.phase, day: f.day })
        .execute()
      fixed += res.rowsAffected()
    }
    console.log(TAG + " " + fixed + " de " + FIXES.length + " filas corregidas")
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar; si falla, las
    // filas siguen como hasta hoy.
    console.log(TAG + " FALLO:", err)
  }
}, (app) => {
  // Sin vuelta atrás: volver a «3 × 3×20s» no tiene sentido.
})
