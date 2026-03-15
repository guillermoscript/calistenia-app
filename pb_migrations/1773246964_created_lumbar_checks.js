/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_3725384270")
  } catch (e) {
    collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
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
        "id": "relation2375276105",
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
        "id": "text2862495610",
        "max": 0,
        "min": 0,
        "name": "date",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number3785434364",
        "max": 5,
        "min": 1,
        "name": "lumbar_score",
        "onlyInt": false,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "bool797496658",
        "name": "slept_well",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "number3333948269",
        "max": null,
        "min": null,
        "name": "sitting_hours",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "date3615485344",
        "max": "",
        "min": "",
        "name": "checked_at",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      }
    ],
    "id": "pbc_3725384270",
    "indexes": [
      "CREATE INDEX idx_lumbar_checks_user ON lumbar_checks (user)",
      "CREATE INDEX idx_lumbar_checks_user_date ON lumbar_checks (user, date)"
    ],
    "listRule": "user = @request.auth.id",
    "name": "lumbar_checks",
    "system": false,
    "type": "base",
    "updateRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id"
  });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_3725384270");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
