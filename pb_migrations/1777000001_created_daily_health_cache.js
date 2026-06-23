/// <reference path="../pb_data/types.d.ts" />

/**
 * daily_health_cache — one row per user+date holding the rolled-up daily
 * summary of imported health-hub data (steps, calories, recovery, sleep,
 * weight). Recomputed/upserted on each sync so dashboards read a single
 * cheap row instead of scanning health_samples.
 *
 * `date` is a local "YYYY-MM-DD" text key (matching the convention used by
 * sleep_entries / packages/core/lib/monthActivity.ts) with a UNIQUE index on
 * (user, date) so the sync can upsert idempotently.
 *
 * All metric fields are optional — a given day may only have some metrics.
 */
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("daily_health_cache")
  } catch (e) {
    const num = (id, name, onlyInt) => ({
      "hidden": false,
      "id": id,
      "max": null,
      "min": 0,
      "name": name,
      "onlyInt": !!onlyInt,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    })

    collection = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "daily_health_cache",
      "system": false,
      "type": "base",
      "id": "pbc_daily_health_cache",
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
          "id": "relation_dhc_user",
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
          "id": "text_dhc_date",
          "max": 10,
          "min": 10,
          "name": "date",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        num("number_dhc_steps", "steps", true),
        num("number_dhc_active_cal", "active_calories", false),
        num("number_dhc_total_cal", "total_calories", false),
        num("number_dhc_resting_hr", "resting_hr", true),
        num("number_dhc_hrv", "hrv_ms", false),
        num("number_dhc_vo2max", "vo2max", false),
        num("number_dhc_sleep_min", "sleep_minutes", true),
        num("number_dhc_sleep_quality", "sleep_quality", false),
        num("number_dhc_weight", "weight_kg", false),
        num("number_dhc_body_fat", "body_fat_pct", false)
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_dhc_user_date ON daily_health_cache (user, date)"
      ]
    })
  }

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("daily_health_cache")
    return app.delete(collection)
  } catch (e) {
    // Already deleted, ignore
  }
})
