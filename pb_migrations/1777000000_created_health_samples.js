/// <reference path="../pb_data/types.d.ts" />

/**
 * health_samples — raw samples imported from a phone health hub
 * (Android Google Health Connect / iOS Apple HealthKit) which in turn
 * aggregate data from any connected smartwatch.
 *
 * This is the canonical landing table for IMPORTED data. It is kept fully
 * separate from user-entered rows (nutrition_entries, manual sleep_entries,
 * manual weight_entries) so a sync can never clobber what the user typed.
 * The `source` flag distinguishes origin; `external_id` (the hub record id /
 * clientRecordId) is used for idempotent de-duplication on re-sync.
 *
 * Dashboards should read the rolled-up daily_health_cache, NOT this table.
 */
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("health_samples")
  } catch (e) {
    collection = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "health_samples",
      "system": false,
      "type": "base",
      "id": "pbc_health_samples",
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
          "id": "relation_hs_user",
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
          "id": "select_hs_source",
          "maxSelect": 1,
          "name": "source",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "select",
          "values": ["health_connect", "healthkit", "manual"]
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_hs_data_type",
          "max": 50,
          "min": 0,
          "name": "data_type",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "number_hs_value",
          "max": null,
          "min": null,
          "name": "value",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_hs_unit",
          "max": 20,
          "min": 0,
          "name": "unit",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "date_hs_start",
          "max": "",
          "min": "",
          "name": "start_time",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "hidden": false,
          "id": "date_hs_end",
          "max": "",
          "min": "",
          "name": "end_time",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_hs_external_id",
          "max": 255,
          "min": 0,
          "name": "external_id",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "json_hs_metadata",
          "maxSize": 0,
          "name": "metadata",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "hidden": false,
          "id": "autodate_hs_synced",
          "name": "synced_at",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE INDEX idx_hs_user_type_start ON health_samples (user, data_type, start_time)",
        "CREATE INDEX idx_hs_user_external ON health_samples (user, external_id)"
      ]
    })
  }

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("health_samples")
    return app.delete(collection)
  } catch (e) {
    // Already deleted, ignore
  }
})
