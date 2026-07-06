/// <reference path="../pb_data/types.d.ts" />

/**
 * shopping_lists — Despensa F3 (issue #172, épica #153).
 * items es json: [{ name, name_normalized, qty, unit, est_price, currency,
 *   checked, actual_price, reasons, incompatible_have }].
 * Los totales son numbers desnormalizados para listar sin parsear el json.
 */
migrate((app) => {
  try {
    app.findCollectionByNameOrId("shopping_lists")
  } catch (e) {
    const lists = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "shopping_lists",
      "system": false,
      "type": "base",
      "id": "pbc_shopping_lists",
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false, "id": "text3208210256", "max": 15, "min": 15,
          "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false,
          "primaryKey": true, "required": true, "system": true, "type": "text"
        },
        {
          "cascadeDelete": true, "collectionId": "_pb_users_auth_",
          "hidden": false, "id": "relation_sl_user", "maxSelect": 1, "minSelect": 0,
          "name": "user", "presentable": false, "required": true, "system": false,
          "type": "relation"
        },
        {
          "hidden": false, "id": "select_sl_status", "maxSelect": 1,
          "name": "status", "presentable": false, "required": false,
          "system": false, "type": "select", "values": ["active", "done"]
        },
        {
          "hidden": false, "id": "json_sl_items", "maxSize": 0,
          "name": "items", "presentable": false, "required": false,
          "system": false, "type": "json"
        },
        {
          "cascadeDelete": false, "collectionId": app.findCollectionByNameOrId("weekly_meal_plans").id,
          "hidden": false, "id": "relation_sl_plan", "maxSelect": 1, "minSelect": 0,
          "name": "linked_plan", "presentable": false, "required": false,
          "system": false, "type": "relation"
        },
        {
          "hidden": false, "id": "number_sl_total_est", "max": null, "min": null,
          "name": "total_est", "onlyInt": false, "presentable": false,
          "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_sl_total_actual", "max": null, "min": null,
          "name": "total_actual", "onlyInt": false, "presentable": false,
          "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "autodate_sl_created", "name": "created",
          "onCreate": true, "onUpdate": false, "presentable": false,
          "system": false, "type": "autodate"
        },
        {
          "hidden": false, "id": "autodate_sl_updated", "name": "updated",
          "onCreate": true, "onUpdate": true, "presentable": false,
          "system": false, "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE INDEX idx_sl_user_status ON shopping_lists (user, status)"
      ]
    })
    app.save(lists)
  }
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("shopping_lists"))
  } catch (e) {
    // Already deleted, ignore
  }
})
