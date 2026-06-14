/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_expo_push_tokens")
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
          "id": "relation_ept_user",
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
          "id": "text_ept_token",
          "max": 0,
          "min": 0,
          "name": "token",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_ept_platform",
          "max": 0,
          "min": 0,
          "name": "platform",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        }
      ],
      "id": "pbc_expo_push_tokens",
      "indexes": [
        "CREATE UNIQUE INDEX idx_ept_token ON expo_push_tokens (token)"
      ],
      "listRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "name": "expo_push_tokens",
      "system": false,
      "type": "base",
      "updateRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "viewRule": "@request.auth.id != \"\" && user = @request.auth.id"
    });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_expo_push_tokens");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
