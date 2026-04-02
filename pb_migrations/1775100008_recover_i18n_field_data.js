/// <reference path="../pb_data/types.d.ts" />

/**
 * Recovery migration: the original i18n migration (1774378015) used
 * removeByName + add with a NEW field id, causing PocketBase to treat
 * it as a column drop + recreate — losing data.
 *
 * PocketBase renames dropped columns to `_removed_<name>_<suffix>` or
 * similar. This migration attempts to find those orphaned columns and
 * copy data back. If no orphaned columns exist (fresh DB or already
 * recovered), this is a no-op.
 */
migrate(
  (app) => {
    const tables = [
      { name: "programs",           fields: ["name", "description"] },
      { name: "program_phases",     fields: ["name"] },
      { name: "program_exercises",  fields: ["day_name", "day_focus", "exercise_name", "muscles", "note", "workout_title"] },
      { name: "program_day_config", fields: ["day_name", "day_focus"] },
    ]

    for (const table of tables) {
      // Get actual SQLite columns for this table
      let columns
      try {
        const result = []
        app.db().newQuery(`PRAGMA table_info(${table.name})`).all(result)
        columns = result.map(r => r.name)
      } catch { continue }

      for (const fieldName of table.fields) {
        // Find orphaned columns: PocketBase names them like `_removed_fieldName_hash`
        const orphaned = columns.filter(c =>
          c.startsWith(`_removed_${fieldName}`) || c.startsWith(`__${fieldName}`)
        )

        if (orphaned.length === 0) continue

        // Use the first orphaned column that has actual data
        for (const oldCol of orphaned) {
          try {
            // Check if the orphaned column has data and current column is empty
            const countResult = []
            app.db().newQuery(`
              SELECT COUNT(*) as cnt FROM ${table.name}
              WHERE "${oldCol}" IS NOT NULL AND "${oldCol}" != '' AND "${oldCol}" != '{"es":""}'
                AND (${fieldName} IS NULL OR ${fieldName} = '' OR ${fieldName} = '{"es":""}')
            `).all(countResult)

            if (countResult.length > 0 && countResult[0].cnt > 0) {
              // Copy data from orphaned column to the new column
              app.db().newQuery(`
                UPDATE ${table.name}
                SET ${fieldName} = "${oldCol}"
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
