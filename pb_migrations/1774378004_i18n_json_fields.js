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
 * Existing string data is wrapped: "Push-up" → {"es": "Push-up"}
 */
migrate(
  (app) => {
    // ── exercises_catalog ──────────────────────────────────────────
    const ec = app.findCollectionByNameOrId("exercises_catalog")
    for (const fieldName of ["name", "muscles", "note", "description"]) {
      const f = ec.fields.getByName(fieldName)
      if (f) f.type = "json"
    }
    app.save(ec)

    app.db().newQuery(`
      UPDATE exercises_catalog
      SET name        = json_object('es', name),
          muscles     = json_object('es', muscles),
          note        = json_object('es', note),
          description = json_object('es', description)
      WHERE json_valid(name) = 0
    `).execute()

    // ── achievements ──────────────────────────────────────────────
    const ach = app.findCollectionByNameOrId("achievements")
    for (const fieldName of ["name", "description"]) {
      const f = ach.fields.getByName(fieldName)
      if (f) f.type = "json"
    }
    app.save(ach)

    app.db().newQuery(`
      UPDATE achievements
      SET name        = json_object('es', name),
          description = json_object('es', description)
      WHERE json_valid(name) = 0
    `).execute()

    // ── food_categories ───────────────────────────────────────────
    const fc = app.findCollectionByNameOrId("food_categories")
    const fcName = fc.fields.getByName("name")
    if (fcName) fcName.type = "json"
    app.save(fc)

    app.db().newQuery(`
      UPDATE food_categories
      SET name = json_object('es', name)
      WHERE json_valid(name) = 0
    `).execute()

    // ── food_tags ─────────────────────────────────────────────────
    const ft = app.findCollectionByNameOrId("food_tags")
    const ftName = ft.fields.getByName("name")
    if (ftName) ftName.type = "json"
    app.save(ft)

    app.db().newQuery(`
      UPDATE food_tags
      SET name = json_object('es', name)
      WHERE json_valid(name) = 0
    `).execute()
  },
  (app) => {
    // ── Rollback: JSON → text, unwrap {"es": "..."} → plain string ──

    // exercises_catalog
    const ec = app.findCollectionByNameOrId("exercises_catalog")
    app.db().newQuery(`
      UPDATE exercises_catalog
      SET name        = COALESCE(json_extract(name, '$.es'), name),
          muscles     = COALESCE(json_extract(muscles, '$.es'), muscles),
          note        = COALESCE(json_extract(note, '$.es'), note),
          description = COALESCE(json_extract(description, '$.es'), description)
      WHERE json_valid(name) = 1
    `).execute()
    for (const fieldName of ["name", "muscles", "note", "description"]) {
      const f = ec.fields.getByName(fieldName)
      if (f) f.type = "text"
    }
    app.save(ec)

    // achievements
    const ach = app.findCollectionByNameOrId("achievements")
    app.db().newQuery(`
      UPDATE achievements
      SET name        = COALESCE(json_extract(name, '$.es'), name),
          description = COALESCE(json_extract(description, '$.es'), description)
      WHERE json_valid(name) = 1
    `).execute()
    for (const fieldName of ["name", "description"]) {
      const f = ach.fields.getByName(fieldName)
      if (f) f.type = "text"
    }
    app.save(ach)

    // food_categories
    const fc = app.findCollectionByNameOrId("food_categories")
    app.db().newQuery(`
      UPDATE food_categories
      SET name = COALESCE(json_extract(name, '$.es'), name)
      WHERE json_valid(name) = 1
    `).execute()
    const fcName = fc.fields.getByName("name")
    if (fcName) fcName.type = "text"
    app.save(fc)

    // food_tags
    const ft = app.findCollectionByNameOrId("food_tags")
    app.db().newQuery(`
      UPDATE food_tags
      SET name = COALESCE(json_extract(name, '$.es'), name)
      WHERE json_valid(name) = 1
    `).execute()
    const ftName = ft.fields.getByName("name")
    if (ftName) ftName.type = "text"
    app.save(ft)
  }
)
