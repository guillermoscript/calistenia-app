/// <reference path="../pb_data/types.d.ts" />

/**
 * shopping_cadence_days en users — ciclo de compra F3 (issue #172).
 * "Compro cada N días". Default de la app: 7 (no se setea default en PB;
 * blank number = 0 y el cliente trata 0/blank como 7).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "shopping_cadence_days")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "number_user_shop_cadence",
      "max": 90,
      "min": 0,
      "name": "shopping_cadence_days",
      "onlyInt": true,
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
    users.fields = users.fields.filter(f => f.id !== "number_user_shop_cadence")
    app.save(users)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
