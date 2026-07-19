/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Idempotent: skip if collection already exists
  try { app.findCollectionByNameOrId("pbc_si0000001"); return } catch (_) {}

  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
    "deleteRule": "user = @request.auth.id",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210257",
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
        "id": "relation_si_user",
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
        "id": "date_si_period_start",
        "max": "",
        "min": "",
        "name": "period_start",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "select_si_period_type",
        "maxSelect": 1,
        "name": "period_type",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "weekly",
          "monthly"
        ]
      },
      {
        "hidden": false,
        "id": "json_si_payload",
        "maxSize": 0,
        "name": "payload",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "autodate_si_generated_at",
        "name": "generated_at",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_si0000001",
    "indexes": [
      "CREATE UNIQUE INDEX idx_sleep_insights_user_period ON sleep_insights (user, period_type, period_start)"
    ],
    "listRule": "user = @request.auth.id",
    "name": "sleep_insights",
    "system": false,
    "type": "base",
    "updateRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_si0000001");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
