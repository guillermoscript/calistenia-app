/// <reference path="../pb_data/types.d.ts" />

/**
 * Convert translatable text fields to JSON fields for i18n support (v2).
 *
 * Replaces the broken 1774378004 migration that used field.type mutation
 * (not supported by PocketBase). This migration handles both cases:
 *   - Field is still text (needs conversion)
 *   - Field is already json (1774378004 partially succeeded — skip)
 *
 * Affected collections and fields:
 *   exercises_catalog: name, muscles, note, description
 *   achievements:      name, description
 *   food_categories:   name
 *   food_tags:         name
 */
migrate(
  (app) => {
    function convertField(collection, fieldName) {
      const field = collection.fields.getByName(fieldName)
      if (!field) return // field doesn't exist, skip

      // Already json? Skip schema change, just ensure data is wrapped
      if (field.type === "json") {
        app.db().newQuery(`
          UPDATE ${collection.name}
          SET ${fieldName} = json_object('es', ${fieldName})
          WHERE ${fieldName} IS NOT NULL
            AND ${fieldName} != ''
            AND json_valid(${fieldName}) = 0
        `).execute()
        return
      }

      // Convert data first (text → JSON string stored in text column)
      app.db().newQuery(`
        UPDATE ${collection.name}
        SET ${fieldName} = CASE
          WHEN ${fieldName} IS NULL OR ${fieldName} = '' THEN '{"es":""}'
          WHEN json_valid(${fieldName}) = 1 THEN ${fieldName}
          ELSE json_object('es', ${fieldName})
        END
      `).execute()

      // Remove text field, add json field
      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "json",
        required: false,
      }))
    }

    // ── exercises_catalog ──────────────────────────────────────────
    const ec = app.findCollectionByNameOrId("exercises_catalog")
    for (const f of ["name", "muscles", "note", "description"]) {
      convertField(ec, f)
    }
    app.save(ec)

    // ── achievements ──────────────────────────────────────────────
    const ach = app.findCollectionByNameOrId("achievements")
    for (const f of ["name", "description"]) {
      convertField(ach, f)
    }
    app.save(ach)

    // ── food_categories ───────────────────────────────────────────
    const fc = app.findCollectionByNameOrId("food_categories")
    convertField(fc, "name")
    app.save(fc)

    // ── food_tags ─────────────────────────────────────────────────
    const ft = app.findCollectionByNameOrId("food_tags")
    convertField(ft, "name")
    app.save(ft)
  },
  (app) => {
    function revertField(collection, fieldName) {
      const field = collection.fields.getByName(fieldName)
      if (!field) return
      if (field.type !== "json") return // already text, skip

      // Unwrap JSON to plain string
      app.db().newQuery(`
        UPDATE ${collection.name}
        SET ${fieldName} = CASE
          WHEN json_valid(${fieldName}) = 1 THEN COALESCE(json_extract(${fieldName}, '$.es'), '')
          ELSE COALESCE(${fieldName}, '')
        END
      `).execute()

      // Remove json field, add text field
      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "text",
        required: false,
      }))
    }

    const ec = app.findCollectionByNameOrId("exercises_catalog")
    for (const f of ["name", "muscles", "note", "description"]) {
      revertField(ec, f)
    }
    app.save(ec)

    const ach = app.findCollectionByNameOrId("achievements")
    for (const f of ["name", "description"]) {
      revertField(ach, f)
    }
    app.save(ach)

    const fc = app.findCollectionByNameOrId("food_categories")
    revertField(fc, "name")
    app.save(fc)

    const ft = app.findCollectionByNameOrId("food_tags")
    revertField(ft, "name")
    app.save(ft)
  }
)
