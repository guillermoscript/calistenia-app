/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_4000000041")
  } catch (e) {
    collection = new Collection({
    "createRule": null,
    "deleteRule": null,
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
        "id": "relation_aj_user",
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
        "id": "text_aj_type",
        "max": 50,
        "min": 0,
        "name": "type",
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
        "id": "text_aj_status",
        "max": 20,
        "min": 0,
        "name": "status",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json_aj_input",
        "maxSize": 0,
        "name": "input",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "file_aj_input_images",
        "maxSelect": 5,
        "maxSize": 10485760,
        "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
        "name": "input_images",
        "presentable": false,
        "protected": false,
        "required": false,
        "system": false,
        "thumbs": [],
        "type": "file"
      },
      {
        "hidden": false,
        "id": "json_aj_result",
        "maxSize": 0,
        "name": "result",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_aj_error",
        "max": 0,
        "min": 0,
        "name": "error",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      }
    ],
    "id": "pbc_4000000041",
    "indexes": [
      "CREATE INDEX idx_aj_user ON ai_jobs (user)",
      "CREATE INDEX idx_aj_status ON ai_jobs (status)"
    ],
    "listRule": "user = @request.auth.id",
    "name": "ai_jobs",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": "user = @request.auth.id"
  });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_4000000041");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
