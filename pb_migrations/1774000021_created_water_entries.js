/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_water_001")
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
          "id": "relation_water_user",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "user",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "number_water_amount",
          "max": null,
          "min": 0,
          "name": "amount_ml",
          "onlyInt": true,
          "presentable": false,
          "required": true,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "autodate_water_logged",
          "max": "",
          "min": "",
          "name": "logged_at",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "id": "pbc_water_001",
      "indexes": [
        "CREATE INDEX idx_water_user ON water_entries (user)",
        "CREATE INDEX idx_water_user_date ON water_entries (user, logged_at)"
      ],
      "listRule": "user = @request.auth.id",
      "name": "water_entries",
      "system": false,
      "type": "base",
      "updateRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id"
    });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_water_001");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
