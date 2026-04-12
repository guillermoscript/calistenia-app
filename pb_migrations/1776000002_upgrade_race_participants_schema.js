/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 1 of race feature redesign.
 *
 * Adds gps_track (json). Retypes last_update and finished_at text -> date.
 * Dedupes existing duplicate participant rows, keeping the one with the
 * highest distance_km per (race, user), then creates a UNIQUE index to
 * prevent future duplicates at the DB level.
 *
 * Rules tightened: create only while race is waiting; update only while race
 * is countdown or active. Enforces the anti-cheat status window.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('race_participants')

    // ── Add gps_track ───────────────────────────────────────────────────────
    if (!collection.fields.getByName('gps_track')) {
      collection.fields.add(new Field({
        name: 'gps_track',
        type: 'json',
      }))
    }

    // ── Retype last_update: text -> date ───────────────────────────────────
    const lastUpdate = collection.fields.getByName('last_update')
    if (lastUpdate && lastUpdate.type !== 'date') {
      collection.fields.removeByName('last_update')
      collection.fields.add(new Field({
        name: 'last_update',
        type: 'date',
      }))
    }

    // ── Retype finished_at: text -> date ───────────────────────────────────
    const finishedAt = collection.fields.getByName('finished_at')
    if (finishedAt && finishedAt.type !== 'date') {
      collection.fields.removeByName('finished_at')
      collection.fields.add(new Field({
        name: 'finished_at',
        type: 'date',
      }))
    }

    // ── Rules ───────────────────────────────────────────────────────────────
    collection.listRule = '@request.auth.id != ""'
    collection.viewRule = '@request.auth.id != ""'
    collection.createRule = '@request.auth.id = user && race.status = "waiting"'
    collection.updateRule = '@request.auth.id = user && (race.status = "active" || race.status = "countdown")'
    collection.deleteRule = '@request.auth.id = user && status = "joined"'

    app.save(collection)

    // ── Post-save data recovery ────────────────────────────────────────────
    try {
      const result = []
      app.db().newQuery('PRAGMA table_info(race_participants)').all(result)
      const columns = result.map(r => r.name)

      const orphanedLastUpdate = columns.filter(c => c.startsWith('_removed_last_update'))
      for (const oldCol of orphanedLastUpdate) {
        app.db().newQuery(`
          UPDATE race_participants
          SET last_update = "${oldCol}"
          WHERE last_update IS NULL AND "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
        `).execute()
      }

      const orphanedFinishedAt = columns.filter(c => c.startsWith('_removed_finished_at'))
      for (const oldCol of orphanedFinishedAt) {
        app.db().newQuery(`
          UPDATE race_participants
          SET finished_at = "${oldCol}"
          WHERE finished_at IS NULL AND "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
        `).execute()
      }
    } catch (e) { /* ignore */ }

    // ── Dedupe existing duplicates before unique index ─────────────────────
    // For each (race, user) group with >1 rows, keep the row with the highest
    // distance_km (ties broken by most recent updated), delete the rest.
    try {
      app.db().newQuery(`
        DELETE FROM race_participants
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY race, user
                     ORDER BY distance_km DESC, updated DESC
                   ) AS rn
            FROM race_participants
          ) WHERE rn = 1
        )
      `).execute()
    } catch (e) { /* ignore */ }

    // ── Unique + lookup indexes ────────────────────────────────────────────
    const fresh = app.findCollectionByNameOrId('race_participants')
    const existingIndexes = fresh.indexes || []
    const wanted = [
      ...existingIndexes.filter(idx =>
        !idx.includes('idx_rp_unique') && !idx.includes('idx_rp_race_distance'),
      ),
      'CREATE UNIQUE INDEX idx_rp_unique ON race_participants (race, "user")',
      'CREATE INDEX idx_rp_race_distance ON race_participants (race, distance_km)',
    ]
    fresh.indexes = wanted
    app.save(fresh)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('race_participants')

    // Drop our indexes, keep the rest
    collection.indexes = (collection.indexes || []).filter(idx =>
      !idx.includes('idx_rp_unique') && !idx.includes('idx_rp_race_distance'),
    )

    // Revert rules
    collection.listRule = '@request.auth.id != ""'
    collection.viewRule = '@request.auth.id != ""'
    collection.createRule = '@request.auth.id = user'
    collection.updateRule = '@request.auth.id = user'
    collection.deleteRule = '@request.auth.id = user'

    // Drop gps_track
    const gt = collection.fields.getByName('gps_track')
    if (gt) collection.fields.removeById(gt.id)

    // Revert last_update / finished_at to text
    const lastUpdate = collection.fields.getByName('last_update')
    if (lastUpdate) {
      collection.fields.removeById(lastUpdate.id)
      collection.fields.add(new Field({ name: 'last_update', type: 'text' }))
    }
    const finishedAt = collection.fields.getByName('finished_at')
    if (finishedAt) {
      collection.fields.removeById(finishedAt.id)
      collection.fields.add(new Field({ name: 'finished_at', type: 'text' }))
    }

    app.save(collection)
  },
)
