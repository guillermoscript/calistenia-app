/// <reference path="../pb_data/types.d.ts" />

/**
 * Add structured goal + body-composition fields to the users collection (#226).
 *
 * - primary_goal: objetivo principal estructurado (select, single). Manda sobre
 *   el delta de peso en inferGoalType y alimenta nutrición/coach.
 * - waist: cintura en cm, opcional. Se usa para el WHtR (ratio cintura/altura)
 *   mostrado junto al IMC; cada captura se registra además en body_measurements.
 *
 * Campos nuevos, sin riesgo de pérdida de datos.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "primary_goal")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "select_user_primary_goal",
      "maxSelect": 1,
      "name": "primary_goal",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": [
        "ganar_musculo",
        "perder_grasa",
        "recomposicion",
        "resistencia",
        "habilidades",
        "salud_general"
      ]
    }))
  }

  if (!users.fields.find(f => f.name === "waist")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "number_user_waist",
      "max": null,
      "min": 0,
      "name": "waist",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  app.save(users)
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    const toRemove = ["select_user_primary_goal", "number_user_waist"]
    users.fields = users.fields.filter(f => !toRemove.includes(f.id))
    app.save(users)
  } catch (e) {}
})
