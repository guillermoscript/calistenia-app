/// <reference path="../pb_data/types.d.ts" />

/**
 * Convert program-related text fields to JSON for i18n support.
 *
 * IMPORTANT: PocketBase drops + recreates columns on type changes, even when
 * the field ID is preserved. Data converted BEFORE app.save() is lost.
 *
 * Strategy:
 *   1. Change field types (text → json) via app.save()
 *   2. AFTER save, find the orphaned _removed_* columns (old data)
 *   3. Copy data from orphaned columns to the new JSON columns, wrapping in i18n
 *
 * Affected collections and fields:
 *   programs:           name, description
 *   program_phases:     name
 *   program_exercises:  day_name, day_focus, exercise_name, muscles, note, workout_title
 *   program_day_config: day_name, day_focus
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
      // After app.save(), PB renamed the old column to _removed_<name>_<hash>.
      // Find it and copy data to the new (empty) JSON column.
      try {
        const result = []
        app.db().newQuery(`PRAGMA table_info(${tableName})`).all(result)
        const columns = result.map(r => r.name)

        const orphaned = columns.filter(c =>
          c.startsWith(`_removed_${fieldName}`)
        )

        for (const oldCol of orphaned) {
          // Check if orphaned column has data
          const countResult = []
          app.db().newQuery(`
            SELECT COUNT(*) as cnt FROM ${tableName}
            WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
              AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
          `).all(countResult)

          if (countResult.length > 0 && countResult[0].cnt > 0) {
            // Wrap text data in i18n JSON and copy to new column
            app.db().newQuery(`
              UPDATE ${tableName}
              SET ${fieldName} = CASE
                WHEN "${oldCol}" IS NULL OR "${oldCol}" = '' THEN '{"es":""}'
                WHEN json_valid("${oldCol}") = 1 THEN "${oldCol}"
                ELSE json_object('es', "${oldCol}")
              END
              WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
                AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
            `).execute()
          }
        }
      } catch (e) {
        // If table doesn't exist or columns aren't found, skip silently
      }
    }

    // ── programs ──────────────────────────────────────────────────
    const programs = app.findCollectionByNameOrId("programs")
    for (const f of ["name", "description"]) {
      changeFieldType(programs, f)
    }
    app.save(programs)
    // Recover data AFTER save (columns have been recreated at this point)
    for (const f of ["name", "description"]) {
      recoverData(app, "programs", f)
    }

    // ── program_phases ───────────────────────────────────────────
    const phases = app.findCollectionByNameOrId("program_phases")
    changeFieldType(phases, "name")
    app.save(phases)
    recoverData(app, "program_phases", "name")

    // ── program_exercises ────────────────────────────────────────
    const exercises = app.findCollectionByNameOrId("program_exercises")
    for (const f of ["day_name", "day_focus", "exercise_name", "muscles", "note", "workout_title"]) {
      changeFieldType(exercises, f)
    }
    app.save(exercises)
    for (const f of ["day_name", "day_focus", "exercise_name", "muscles", "note", "workout_title"]) {
      recoverData(app, "program_exercises", f)
    }

    // ── program_day_config ───────────────────────────────────────
    try {
      const dayConfig = app.findCollectionByNameOrId("program_day_config")
      for (const f of ["day_name", "day_focus"]) {
        changeFieldType(dayConfig, f)
      }
      app.save(dayConfig)
      for (const f of ["day_name", "day_focus"]) {
        recoverData(app, "program_day_config", f)
      }
    } catch { /* collection may not exist in older deployments */ }
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

    // Revert schema (data recovery on revert would need the same orphaned-column approach)
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
