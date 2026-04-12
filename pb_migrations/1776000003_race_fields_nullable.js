/// <reference path="../pb_data/types.d.ts" />

/**
 * Fix for phase 1 migrations: mode, starts_at, ends_at, finished_at on races
 * and last_update, finished_at on race_participants were created with the
 * default required=true (PB Field default), making CREATE payloads reject
 * because the context only knows about starts_at/ends_at at countdown time.
 *
 * These fields are semantically optional at creation time — set later by the
 * countdown/finish transitions. Convert to required=false in place, preserving
 * each field.id to avoid data loss.
 */
migrate(
  (app) => {
    const races = app.findCollectionByNameOrId('races')
    const racesFields = ['mode', 'starts_at', 'ends_at', 'finished_at']
    for (const name of racesFields) {
      const f = races.fields.getByName(name)
      if (!f) continue
      f.required = false
    }
    app.save(races)

    const rp = app.findCollectionByNameOrId('race_participants')
    const rpFields = ['last_update', 'finished_at', 'gps_track']
    for (const name of rpFields) {
      const f = rp.fields.getByName(name)
      if (!f) continue
      f.required = false
    }
    app.save(rp)
  },
  (app) => {
    // Down: no-op. Making fields required again would break records.
  },
)
