/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_workout_rem")
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
          "id": "relation_wr_user",
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
          "id": "number_wr_hour",
          "max": 23,
          "min": 0,
          "name": "hour",
          "onlyInt": true,
          "presentable": false,
          "required": true,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "number_wr_minute",
          "max": 59,
          "min": 0,
          "name": "minute",
          "onlyInt": true,
          "presentable": false,
          "required": true,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "json_wr_days",
          "maxSize": 0,
          "name": "days_of_week",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "json"
        },
        {
          "hidden": false,
          "id": "bool_wr_enabled",
          "name": "enabled",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "bool"
        }
      ],
      "id": "pbc_workout_rem",
      "indexes": [
        "CREATE INDEX idx_wr_user ON workout_reminders (user)"
      ],
      "listRule": "user = @request.auth.id",
      "name": "workout_reminders",
      "system": false,
      "type": "base",
      "updateRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id"
    });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_workout_rem");
    return app.delete(collection);
  } catch (e) {}
})
