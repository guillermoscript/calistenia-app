/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_4176526388")
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
        "cascadeDelete": false,
        "collectionId": "pbc_2970041692",
        "hidden": false,
        "id": "relation2465036164",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "program",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "date222754019",
        "max": "",
        "min": "",
        "name": "started_at",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "bool3402609347",
        "name": "is_current",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_4176526388",
    "indexes": [
      "CREATE INDEX idx_user_programs_user ON user_programs (user)",
      "CREATE INDEX idx_user_programs_current ON user_programs (user, is_current)"
    ],
    "listRule": "user = @request.auth.id",
    "name": "user_programs",
    "system": false,
    "type": "base",
    "updateRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id"
  });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_4176526388");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
