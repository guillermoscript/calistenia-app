/// <reference path="../pb_data/types.d.ts" />

/**
 * Recovery migration: find orphaned _removed_* columns from the i18n
 * migration and copy data back to the new JSON columns.
 *
 * PocketBase renames dropped columns to `_removed_<name>_<suffix>`.
 * This migration finds those columns and restores lost data.
 *
 * If no orphaned columns exist (fresh DB or already recovered), this is a no-op.
 * For full data re-population, use: node scripts/repair-program-data.mjs
 */
migrate(
  (app) => {
    const tables = [
      { name: "programs",           fields: ["name", "description"] },
      { name: "program_phases",     fields: ["name"] },
      { name: "program_exercises",  fields: ["day_name", "day_focus", "exercise_name", "muscles", "note", "workout_title"] },
      { name: "program_day_config", fields: ["day_name", "day_focus"] },
      { name: "exercises_catalog",  fields: ["name", "muscles", "note", "description"] },
    ]

    for (const table of tables) {
      let columns
      try {
        const result = []
        app.db().newQuery(`PRAGMA table_info(${table.name})`).all(result)
        columns = result.map(r => r.name)
      } catch { continue }

      for (const fieldName of table.fields) {
        // Find orphaned columns: PocketBase names them `_removed_fieldName_hash`
        const orphaned = columns.filter(c =>
          c.startsWith(`_removed_${fieldName}`) || c.startsWith(`__${fieldName}`)
        )

        if (orphaned.length === 0) continue

        for (const oldCol of orphaned) {
          try {
            const countResult = []
            app.db().newQuery(`
              SELECT COUNT(*) as cnt FROM ${table.name}
              WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != '' AND "${oldCol}" != '{"es":""}'
                AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
            `).all(countResult)

            if (countResult.length > 0 && countResult[0].cnt > 0) {
              // Wrap in i18n format if needed, then copy
              app.db().newQuery(`
                UPDATE ${table.name}
                SET ${fieldName} = CASE
                  WHEN json_valid("${oldCol}") = 1 THEN "${oldCol}"
                  ELSE json_object('es', "${oldCol}")
                END
                WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != '' AND "${oldCol}" != '{"es":""}'
                  AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
              `).execute()

              console.log(`[i18n-recovery] Restored ${table.name}.${fieldName} from ${oldCol} (${countResult[0].cnt} rows)`)
            }
          } catch (e) {
            console.log(`[i18n-recovery] Could not restore ${table.name}.${fieldName} from ${oldCol}: ${e}`)
          }
        }
      }
    }
  },
  (app) => {
    // No-op revert — recovery is idempotent
  }
)
