/// <reference path="../pb_data/types.d.ts" />

/**
 * Convert program-related text fields to JSON for i18n support.
 *
 * The program editor sends toTranslatable() objects like {"es":"..."} but
 * these collections still had text fields, causing "Cannot be blank" errors.
 *
 * Affected collections and fields:
 *   programs:           name, description
 *   program_phases:     name
 *   program_exercises:  day_name, day_focus, exercise_name, muscles, note, workout_title
 *   program_day_config: day_name, day_focus
 */
migrate(
  (app) => {
    function convertField(collection, fieldName) {
      const field = collection.fields.getByName(fieldName)
      if (!field) return
      if (field.type === "json") return // already converted

      // Wrap existing text data in JSON
      app.db().newQuery(`
        UPDATE ${collection.name}
        SET ${fieldName} = CASE
          WHEN ${fieldName} IS NULL OR ${fieldName} = '' THEN '{"es":""}'
          WHEN json_valid(${fieldName}) = 1 THEN ${fieldName}
          ELSE json_object('es', ${fieldName})
        END
      `).execute()

      // Replace text field with json field
      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "json",
        required: false,
      }))
    }

    // ── programs ──────────────────────────────────────────────────
    const programs = app.findCollectionByNameOrId("programs")
    for (const f of ["name", "description"]) {
      convertField(programs, f)
    }
    app.save(programs)

    // ── program_phases ───────────────────────────────────────────
    const phases = app.findCollectionByNameOrId("program_phases")
    convertField(phases, "name")
    app.save(phases)

    // ── program_exercises ────────────────────────────────────────
    const exercises = app.findCollectionByNameOrId("program_exercises")
    for (const f of ["day_name", "day_focus", "exercise_name", "muscles", "note", "workout_title"]) {
      convertField(exercises, f)
    }
    app.save(exercises)

    // ── program_day_config ───────────────────────────────────────
    try {
      const dayConfig = app.findCollectionByNameOrId("program_day_config")
      for (const f of ["day_name", "day_focus"]) {
        convertField(dayConfig, f)
      }
      app.save(dayConfig)
    } catch { /* collection may not exist in older deployments */ }
  },
  (app) => {
    function revertField(collection, fieldName) {
      const field = collection.fields.getByName(fieldName)
      if (!field) return
      if (field.type !== "json") return

      app.db().newQuery(`
        UPDATE ${collection.name}
        SET ${fieldName} = CASE
          WHEN json_valid(${fieldName}) = 1 THEN COALESCE(json_extract(${fieldName}, '$.es'), '')
          ELSE COALESCE(${fieldName}, '')
        END
      `).execute()

      collection.fields.removeByName(fieldName)
      collection.fields.add(new Field({
        name: fieldName,
        type: "text",
        required: false,
      }))
    }

    const programs = app.findCollectionByNameOrId("programs")
    for (const f of ["name", "description"]) {
      revertField(programs, f)
    }
    app.save(programs)

    const phases = app.findCollectionByNameOrId("program_phases")
    revertField(phases, "name")
    app.save(phases)

    const exercises = app.findCollectionByNameOrId("program_exercises")
    for (const f of ["day_name", "day_focus", "exercise_name", "muscles", "note", "workout_title"]) {
      revertField(exercises, f)
    }
    app.save(exercises)

    try {
      const dayConfig = app.findCollectionByNameOrId("program_day_config")
      for (const f of ["day_name", "day_focus"]) {
        revertField(dayConfig, f)
      }
      app.save(dayConfig)
    } catch {}
  }
)
