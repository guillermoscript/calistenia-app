/// <reference path="../pb_data/types.d.ts" />

/**
 * Preview pública de retos express para la landing de invitación (#313).
 *
 * /invite/<code>/challenge/<id> necesita enseñar el reto a visitantes SIN
 * sesión, pero challenges y challenge_participants exigen auth en sus view/list
 * rules. Igual que public_referral_lookup: corre con $app (salta las API
 * rules) y devuelve solo los campos mínimos de la tarjeta. Limitado a retos
 * type = "express" — los títulos/detalles de retos normales no se exponen.
 */
routerAdd("GET", "/api/public/challenge-preview/{id}", (e) => {
  const id = e.request.pathValue("id")
  if (!id) {
    return e.json(400, { error: "missing id" })
  }

  let ch
  try {
    ch = $app.findRecordById("challenges", id)
  } catch (err) {
    return e.json(404, { error: "not found" })
  }

  if (ch.getString("type") !== "express") {
    return e.json(404, { error: "not found" })
  }

  let exerciseName = ""
  const exerciseId = ch.getString("exercise_id")
  if (exerciseId) {
    try {
      const ex = $app.findRecordById("exercises_catalog", exerciseId)
      // name es json ({es, en}): get() devuelve bytes en JSVM, usar getString
      const raw = ex.getString("name")
      try {
        const parsed = JSON.parse(raw)
        exerciseName = (parsed && (parsed.es || parsed.en)) || ""
      } catch (err2) {
        exerciseName = raw || ""
      }
    } catch (err) { /* ejercicio borrado del catálogo */ }
  }

  let participantCount = 0
  try {
    participantCount = $app.findRecordsByFilter(
      "challenge_participants",
      "challenge = {:cid}",
      "",
      0,
      0,
      { cid: id }
    ).length
  } catch (err) { /* sin participantes */ }

  return e.json(200, {
    id: ch.id,
    title: ch.getString("title"),
    status: ch.getString("status"),
    exercise_name: exerciseName,
    daily_target: ch.get("daily_target") || 0,
    duration_days: ch.get("duration_days") || 0,
    participant_count: participantCount,
  })
})
