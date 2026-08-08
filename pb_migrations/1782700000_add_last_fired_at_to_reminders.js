/// <reference path="../pb_data/types.d.ts" />

/**
 * `last_fired_at` en meal_reminders / workout_reminders.
 *
 * Guarda el instante ISO (UTC) del último push enviado para ese recordatorio.
 * El dispatcher (mcp-server/src/api/reminder-dispatcher.ts) lo usa para
 * garantizar como mucho UN envío por día local del usuario: sin él, la ventana
 * de gracia que cubre ticks tardíos y reinicios produciría duplicados.
 *
 * Campo de servidor: no lo escribe el cliente, solo el API con credenciales de
 * admin, así que no hace falta tocar las reglas de acceso.
 */
migrate((app) => {
  const meal = app.findCollectionByNameOrId("pbc_4000000017")
  meal.fields.add(new Field({
    "hidden": false,
    "id": "text_mr_last_fired_at",
    "name": "last_fired_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  app.save(meal)

  const workout = app.findCollectionByNameOrId("pbc_workout_rem")
  workout.fields.add(new Field({
    "hidden": false,
    "id": "text_wr_last_fired_at",
    "name": "last_fired_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  return app.save(workout)
}, (app) => {
  const meal = app.findCollectionByNameOrId("pbc_4000000017")
  meal.fields.removeById("text_mr_last_fired_at")
  app.save(meal)

  const workout = app.findCollectionByNameOrId("pbc_workout_rem")
  workout.fields.removeById("text_wr_last_fired_at")
  return app.save(workout)
})
