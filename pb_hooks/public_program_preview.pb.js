/// <reference path="../pb_data/types.d.ts" />

/**
 * Landing pública de un programa compartido (#604).
 *
 * `/shared/:id` existe desde siempre y para quien NO tiene sesión —el punto
 * entero de compartir— estaba muerta: `SharedLanding` leía `programs` con el
 * cliente anónimo y el `viewRule` exige `@request.auth.id != ""`, así que la
 * página pintaba «Programa no encontrado» el 100% de las veces.
 *
 * La solución NO es relajar el `viewRule`. Abrirlo a anónimos expondría el
 * catálogo entero de todo el mundo, que es justo lo que #603 acaba de cerrar.
 * En su lugar, esta ruta corre con `$app` —salta las API rules a propósito— y
 * devuelve una lista de campos escrita a mano, solo si el programa está
 * marcado como compartible. Mismo patrón que `public_challenge_preview.pb.js`
 * y `public_referral_lookup.pb.js`.
 *
 * `visibility = "link"` se vuelve alcanzable aquí y solo aquí. #603 lo metió en
 * el enum pero lo dejó fuera de las reglas esperando a esta ruta: por la API de
 * colección un programa `link` se sigue comportando como `private`.
 *
 * TRES COSAS QUE NO SE PUEDEN RELAJAR:
 *
 *  1. La puerta es `visibility in (link, public)`. Un programa `private` —o uno
 *     de un cliente móvil viejo, que nace con el campo vacío— responde 404, y
 *     el mismo 404 que un id inexistente: distinguirlos filtraría qué ids
 *     existen.
 *
 *  2. Los campos se enumeran a mano. Nada de devolver el registro entero: un
 *     campo que se añada mañana a `programs` no debe empezar a publicarse solo.
 *
 *  3. Del autor sale `display_name || name`, JAMÁS el email. `users` lo tiene
 *     oculto por campo desde #411 y devolverlo por aquí sería reabrir ese
 *     agujero por la puerta de atrás.
 *
 * Los campos i18n (`name`, `description`, `exercise_name`, `muscles`) son
 * `json {es,en}` y viajan EN CRUDO, como objeto, no interpolados: el cliente
 * los pasa por `localize()` al pintar (#474). En el JSVM, `record.get()` de un
 * json devuelve bytes, así que hay que leerlos con `getString()` y parsearlos.
 */

routerAdd("GET", "/api/programs/{id}/public", (e) => {
  // Los dos helpers van DENTRO del callback a propósito. Cada handler del JSVM
  // corre en un runtime aislado que NO ve el scope del fichero: declarados
  // arriba llegaban aquí como `undefined` y la ruta contestaba 400 en todos los
  // casos que pasan la puerta de visibilidad —los de un programa privado
  // devuelven antes de llamarlos, así que ese camino parecía sano—. Es el mismo
  // aislamiento que obliga a `require()` dentro de cada handler en
  // `utils/notifications.js` y el que mata en silencio a los `cronAdd`.

  /** Lee un campo json {es,en} y lo devuelve como objeto (o string si es antiguo). */
  function readTranslatable(record, field) {
    const raw = record.getString(field)
    if (!raw) return ""
    try {
      const parsed = JSON.parse(raw)
      // Un string plano también es JSON válido; los registros viejos son así.
      if (parsed && typeof parsed === "object") return parsed
      return parsed == null ? "" : String(parsed)
    } catch (err) {
      return raw
    }
  }

  /** Cuántas filas hijas cuelgan del programa. */
  function countByProgram(collection, programId) {
    try {
      return $app.findRecordsByFilter(
        collection,
        "program = {:pid}",
        "",
        0,
        0,
        { pid: programId }
      ).length
    } catch (err) {
      return 0
    }
  }

  const id = e.request.pathValue("id")
  if (!id) {
    return e.json(400, { error: "missing id" })
  }

  let program
  try {
    program = $app.findRecordById("programs", id)
  } catch (err) {
    return e.json(404, { error: "not found" })
  }

  // La puerta. Mismo 404 que un id inexistente: no se filtra qué existe.
  const visibility = program.getString("visibility")
  if (visibility !== "link" && visibility !== "public") {
    return e.json(404, { error: "not found" })
  }

  // ── Autor ───────────────────────────────────────────────────────────────
  // `display_name || name`. Si el alta fue por Google, `display_name` puede
  // venir vacío y `name` es lo único que hay; devolver el email en su lugar
  // sería filtrarlo (#411).
  let authorName = ""
  const createdBy = program.getString("created_by")
  if (createdBy) {
    try {
      const author = $app.findRecordById("users", createdBy)
      authorName = author.getString("display_name") || author.getString("name") || ""
    } catch (err) { /* autor borrado: el programa sigue siendo válido */ }
  }

  // ── Vista previa de ejercicios ──────────────────────────────────────────
  const exercises = []
  try {
    const rows = $app.findRecordsByFilter(
      "program_exercises",
      "program = {:pid}",
      "phase_number,sort_order",
      8,
      0,
      { pid: id }
    )
    for (const row of rows) {
      exercises.push({
        name: readTranslatable(row, "exercise_name"),
        sets: row.get("sets") || 0,
        reps: row.getString("reps") || "",
        muscles: readTranslatable(row, "muscles"),
      })
    }
  } catch (err) { /* programa sin ejercicios todavía */ }

  return e.json(200, {
    id: program.id,
    name: readTranslatable(program, "name"),
    description: readTranslatable(program, "description"),
    duration_weeks: program.get("duration_weeks") || 0,
    days_per_week: program.get("days_per_week") || 0,
    goal_type: program.getString("goal_type") || "",
    intensity: program.getString("intensity") || "",
    visibility: visibility,
    author_name: authorName,
    phase_count: countByProgram("program_phases", id),
    exercise_count: countByProgram("program_exercises", id),
    exercises: exercises,
  })
})
