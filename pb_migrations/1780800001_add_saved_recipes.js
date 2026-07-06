/// <reference path="../pb_data/types.d.ts" />

/**
 * saved_recipes — Recetas favoritas (issue #179, épica #153).
 * recipe es json con el shape Recipe de F2 (steps, ingredients, prep_minutes,
 * servings, photo_query). Identidad = label_normalized (las recetas viven
 * embebidas en planes, no tienen id propio) con índice único por usuario.
 * times_used queda en schema para F4 ("cocinar de nuevo"); V1 no lo incrementa.
 */
migrate((app) => {
  try {
    app.findCollectionByNameOrId("saved_recipes")
  } catch (e) {
    const col = new Collection({
      "createRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "saved_recipes",
      "system": false,
      "type": "base",
      "id": "pbc_saved_recipes",
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false, "id": "text3208210256", "max": 15, "min": 15,
          "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false,
          "primaryKey": true, "required": true, "system": true, "type": "text"
        },
        {
          "cascadeDelete": true, "collectionId": "_pb_users_auth_",
          "hidden": false, "id": "relation_sr_user", "maxSelect": 1, "minSelect": 0,
          "name": "user", "presentable": false, "required": true, "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "", "hidden": false, "id": "text_sr_label",
          "max": 0, "min": 0, "name": "label", "pattern": "", "presentable": true,
          "primaryKey": false, "required": true, "system": false, "type": "text"
        },
        {
          "autogeneratePattern": "", "hidden": false, "id": "text_sr_label_norm",
          "max": 0, "min": 0, "name": "label_normalized", "pattern": "", "presentable": false,
          "primaryKey": false, "required": true, "system": false, "type": "text"
        },
        {
          "hidden": false, "id": "json_sr_recipe", "maxSize": 0,
          "name": "recipe", "presentable": false, "required": false,
          "system": false, "type": "json"
        },
        {
          "hidden": false, "id": "number_sr_times_used", "max": null, "min": null,
          "name": "times_used", "onlyInt": true, "presentable": false,
          "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "autodate_sr_created", "name": "created",
          "onCreate": true, "onUpdate": false, "presentable": false,
          "system": false, "type": "autodate"
        },
        {
          "hidden": false, "id": "autodate_sr_updated", "name": "updated",
          "onCreate": true, "onUpdate": true, "presentable": false,
          "system": false, "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_sr_user_label ON saved_recipes (user, label_normalized)"
      ]
    })
    app.save(col)
  }
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("saved_recipes"))
  } catch (e) {
    // Already deleted, ignore
  }
})
