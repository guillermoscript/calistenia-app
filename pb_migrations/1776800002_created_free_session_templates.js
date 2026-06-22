/// <reference path="../pb_data/types.d.ts" />

/**
 * free_session_templates — plantillas reutilizables de "sesión libre".
 *
 * Guarda la lista de ejercicios que el usuario armó en una sesión libre para
 * poder re-lanzar el mismo entreno en el futuro (un tap). Se escribe al terminar
 * o al abandonar una sesión libre. Espeja meal_templates (mismo patrón de
 * usage_count / last_used_at). Colección nueva = aditiva, no toca datos previos.
 */
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_free_session_templates")
  } catch (e) {
    collection = new Collection({
      "createRule": "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
      "deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "hidden": false,
          "id": "relation_fst_user",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "user",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_fst_title",
          "max": 0,
          "min": 0,
          "name": "title",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "json_fst_exercises",
          "maxSize": 0,
          "name": "exercises",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "hidden": false,
          "id": "number_fst_usage",
          "max": null,
          "min": null,
          "name": "usage_count",
          "onlyInt": true,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "date_fst_lastused",
          "max": "",
          "min": "",
          "name": "last_used_at",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        }
      ],
      "id": "pbc_free_session_templates",
      "indexes": [
        "CREATE INDEX idx_fst_user ON free_session_templates (user)"
      ],
      "listRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "name": "free_session_templates",
      "system": false,
      "type": "base",
      "updateRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "viewRule": "@request.auth.id != \"\" && user = @request.auth.id"
    })
  }

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_free_session_templates")
    return app.delete(collection)
  } catch (e) {
    // Already deleted, ignore
  }
})
