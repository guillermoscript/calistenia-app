/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_rest_prefs")
  } catch (e) {
    collection = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
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
          "id": "relation_rp_user",
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
          "id": "text_rp_exercise",
          "max": 0,
          "min": 0,
          "name": "exercise_id",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "number_rp_seconds",
          "max": null,
          "min": 5,
          "name": "rest_seconds",
          "onlyInt": true,
          "presentable": false,
          "required": true,
          "system": false,
          "type": "number"
        }
      ],
      "id": "pbc_rest_prefs",
      "indexes": [
        "CREATE UNIQUE INDEX idx_rp_user_exercise ON rest_preferences (user, exercise_id)"
      ],
      "listRule": "user = @request.auth.id",
      "name": "rest_preferences",
      "system": false,
      "type": "base",
      "updateRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id"
    });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_rest_prefs");
    return app.delete(collection);
  } catch (e) {}
})
