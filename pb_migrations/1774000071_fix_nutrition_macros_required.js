/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase treats 0 as "blank" for required number fields sent via FormData.
 * This breaks manual meal logging when a macro is legitimately 0 (e.g. fat-free protein).
 * Fix: set required=false on all macro total fields — they default to 0 anyway.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("nutrition_entries")
    const fields = ["total_calories", "total_protein", "total_carbs", "total_fat"]
    for (const name of fields) {
      const field = collection.fields.getByName(name)
      if (field) {
        field.required = false
      }
    }
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("nutrition_entries")
    const fields = ["total_calories", "total_protein", "total_carbs", "total_fat"]
    for (const name of fields) {
      const field = collection.fields.getByName(name)
      if (field) {
        field.required = true
      }
    }
    app.save(collection)
  }
)
