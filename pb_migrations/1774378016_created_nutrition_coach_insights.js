/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Idempotent: skip if collection already exists
  try { app.findCollectionByNameOrId("pbc_nci0000001"); return } catch (_) {}

  const collection = new Collection({
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
        "id": "relation_nci_user",
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
        "id": "select_nci_type",
        "maxSelect": 1,
        "name": "type",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "daily",
          "weekly"
        ]
      },
      {
        "hidden": false,
        "id": "date_nci_period_start",
        "max": "",
        "min": "",
        "name": "period_start",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_nci_overall_score",
        "max": 1,
        "min": 0,
        "name": "overall_score",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json_nci_insights",
        "maxSize": 0,
        "name": "insights",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_nci_coach_message",
        "max": 1000,
        "min": 0,
        "name": "coach_message",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json_nci_streaks",
        "maxSize": 0,
        "name": "streaks",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "autodate_nci_generated_at",
        "name": "generated_at",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_nci0000001",
    "indexes": [
      "CREATE UNIQUE INDEX idx_nci_user_type_period ON nutrition_coach_insights (user, type, period_start)"
    ],
    "listRule": "user = @request.auth.id",
    "name": "nutrition_coach_insights",
    "system": false,
    "type": "base",
    "updateRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_nci0000001");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
