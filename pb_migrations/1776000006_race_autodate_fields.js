/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds created/updated autodate fields to races and race_participants.
 *
 * PB base collections don't include these by default. Code in
 * useRacePRs / useDiscoverRaces / CardioSessionContext sorts on '-created'
 * which was silently returning 400 'invalid sort field "created"' from PB.
 * Bug was invisible in console because PB's SDK surfaces it via a catch
 * that just reports empty state, and because the hooks had .catch(() => [])
 * swallowing the error.
 *
 * Backfill existing rows with the earliest timestamp we have so sorts are
 * stable from day one.
 */
migrate(
  (app) => {
    for (const colName of ['races', 'race_participants']) {
      const col = app.findCollectionByNameOrId(colName)

      if (!col.fields.getByName('created')) {
        col.fields.add(new AutodateField({
          name: 'created',
          onCreate: true,
          onUpdate: false,
        }))
      }
      if (!col.fields.getByName('updated')) {
        col.fields.add(new AutodateField({
          name: 'updated',
          onCreate: true,
          onUpdate: true,
        }))
      }

      app.save(col)
    }

    // Backfill rows whose created is empty/null — use starts_at for races,
    // last_update or finished_at for race_participants, else now.
    try {
      app.db().newQuery(`
        UPDATE races
        SET created = COALESCE(NULLIF(starts_at, ''), strftime('%Y-%m-%d %H:%M:%S.000Z', 'now')),
            updated = COALESCE(NULLIF(starts_at, ''), strftime('%Y-%m-%d %H:%M:%S.000Z', 'now'))
        WHERE created IS NULL OR created = ''
      `).execute()
    } catch (e) { /* ignore */ }

    try {
      app.db().newQuery(`
        UPDATE race_participants
        SET created = COALESCE(NULLIF(last_update, ''), NULLIF(finished_at, ''), strftime('%Y-%m-%d %H:%M:%S.000Z', 'now')),
            updated = COALESCE(NULLIF(last_update, ''), NULLIF(finished_at, ''), strftime('%Y-%m-%d %H:%M:%S.000Z', 'now'))
        WHERE created IS NULL OR created = ''
      `).execute()
    } catch (e) { /* ignore */ }
  },
  (app) => {
    for (const colName of ['races', 'race_participants']) {
      const col = app.findCollectionByNameOrId(colName)
      const c = col.fields.getByName('created')
      if (c) col.fields.removeById(c.id)
      const u = col.fields.getByName('updated')
      if (u) col.fields.removeById(u.id)
      app.save(col)
    }
  },
)
