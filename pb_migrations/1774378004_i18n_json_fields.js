/// <reference path="../pb_data/types.d.ts" />

/**
 * Convert translatable text fields to JSON fields for i18n support.
 *
 * Affected collections and fields:
 *   exercises_catalog: name, muscles, note, description
 *   achievements:      name, description
 *   food_categories:   name
 *   food_tags:         name
 *
 * Approach: For each field, first convert data in-place (text → JSON string),
 * then remove the text field and add a json field with the same name.
 * This is the correct PB migration pattern — mutating field.type is not supported.
 *
 * Existing string data is wrapped: "Push-up" → {"es": "Push-up"}
 */
migrate(
  (app) => {
    // Helper: convert a text field to json on a collection
    function textToJson(collection, fieldName) {
      // 1. Convert data first (while still text type — stores JSON string in text field)
      app.db().newQuery(`
        UPDATE ${collection.name}
        SET ${fieldName} = CASE
          WHEN ${fieldName} IS NULL OR ${fieldName} = '' THEN '{"es":""}'
          WHEN json_valid(${fieldName}) = 1 THEN ${fieldName}
          ELSE json_object('es', ${fieldName})
        END
      `).execute()

      // 2. Remove old text field, add new json field
      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "json",
        required: false,
      }))
    }

    // ── exercises_catalog ──────────────────────────────────────────
    const ec = app.findCollectionByNameOrId("exercises_catalog")
    for (const fieldName of ["name", "muscles", "note", "description"]) {
      textToJson(ec, fieldName)
    }
    app.save(ec)

    // ── achievements ──────────────────────────────────────────────
    const ach = app.findCollectionByNameOrId("achievements")
    for (const fieldName of ["name", "description"]) {
      textToJson(ach, fieldName)
    }
    app.save(ach)

    // ── food_categories ───────────────────────────────────────────
    const fc = app.findCollectionByNameOrId("food_categories")
    textToJson(fc, "name")
    app.save(fc)

    // ── food_tags ─────────────────────────────────────────────────
    const ft = app.findCollectionByNameOrId("food_tags")
    textToJson(ft, "name")
    app.save(ft)
  },
  (app) => {
    // Helper: convert json field back to text
    function jsonToText(collection, fieldName) {
      // 1. Unwrap JSON to plain string first
      app.db().newQuery(`
        UPDATE ${collection.name}
        SET ${fieldName} = CASE
          WHEN json_valid(${fieldName}) = 1 THEN COALESCE(json_extract(${fieldName}, '$.es'), '')
          ELSE COALESCE(${fieldName}, '')
        END
      `).execute()

      // 2. Remove json field, add text field back
      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "text",
        required: false,
      }))
    }

    // ── Rollback: JSON → text, unwrap {"es": "..."} → plain string ──

    const ec = app.findCollectionByNameOrId("exercises_catalog")
    for (const fieldName of ["name", "muscles", "note", "description"]) {
      jsonToText(ec, fieldName)
    }
    app.save(ec)

    const ach = app.findCollectionByNameOrId("achievements")
    for (const fieldName of ["name", "description"]) {
      jsonToText(ach, fieldName)
    }
    app.save(ach)

    const fc = app.findCollectionByNameOrId("food_categories")
    jsonToText(fc, "name")
    app.save(fc)

    const ft = app.findCollectionByNameOrId("food_tags")
    jsonToText(ft, "name")
    app.save(ft)
  }
)
