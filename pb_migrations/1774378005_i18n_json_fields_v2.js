/// <reference path="../pb_data/types.d.ts" />

/**
 * Convert translatable text fields to JSON fields for i18n support (v2).
 *
 * Affected collections and fields:
 *   exercises_catalog: name, muscles, note, description
 *   achievements:      name, description
 *   food_categories:   name
 *   food_tags:         name
 *
 * NOTE: PocketBase drops + recreates columns on type change.
 * Data recovery from orphaned columns happens after app.save().
 */
migrate(
  (app) => {
    function changeFieldType(collection, fieldName) {
      const field = collection.fields.getByName(fieldName)
      if (!field) return
      if (field.type === "json") return // already converted

      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "json",
        required: false,
      }))
    }

    function recoverData(app, tableName, fieldName) {
      try {
        const result = []
        app.db().newQuery(`PRAGMA table_info(${tableName})`).all(result)
        const columns = result.map(r => r.name)
        const orphaned = columns.filter(c => c.startsWith(`_removed_${fieldName}`))

        for (const oldCol of orphaned) {
          const countResult = []
          app.db().newQuery(`
            SELECT COUNT(*) as cnt FROM ${tableName}
            WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
              AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
          `).all(countResult)

          if (countResult.length > 0 && countResult[0].cnt > 0) {
            app.db().newQuery(`
              UPDATE ${tableName}
              SET ${fieldName} = CASE
                WHEN json_valid("${oldCol}") = 1 THEN "${oldCol}"
                ELSE json_object('es', "${oldCol}")
              END
              WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
                AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
            `).execute()
          }
        }
      } catch { /* ignore */ }
    }

    // ── exercises_catalog ──────────────────────────────────────────
    const ec = app.findCollectionByNameOrId("exercises_catalog")
    for (const f of ["name", "muscles", "note", "description"]) {
      changeFieldType(ec, f)
    }
    app.save(ec)
    for (const f of ["name", "muscles", "note", "description"]) {
      recoverData(app, "exercises_catalog", f)
    }

    // ── achievements ──────────────────────────────────────────────
    const ach = app.findCollectionByNameOrId("achievements")
    for (const f of ["name", "description"]) {
      changeFieldType(ach, f)
    }
    app.save(ach)
    for (const f of ["name", "description"]) {
      recoverData(app, "achievements", f)
    }

    // ── food_categories ───────────────────────────────────────────
    const fc = app.findCollectionByNameOrId("food_categories")
    changeFieldType(fc, "name")
    app.save(fc)
    recoverData(app, "food_categories", "name")

    // ── food_tags ─────────────────────────────────────────────────
    const ft = app.findCollectionByNameOrId("food_tags")
    changeFieldType(ft, "name")
    app.save(ft)
    recoverData(app, "food_tags", "name")
  },
  (app) => {
    function revertField(collection, fieldName) {
      const field = collection.fields.getByName(fieldName)
      if (!field) return
      if (field.type !== "json") return

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
