/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 1 of race feature redesign.
 *
 * Adds: mode, target_duration_seconds, ends_at (datetime).
 * Converts: started_at (text) -> starts_at (datetime), finished_at (text -> datetime).
 *
 * PocketBase drops the column on type change. For starts_at we rename first by
 * introducing the new field alongside, copying data via raw SQL, then dropping
 * the old text column. finished_at changes type in place; existing ISO-text
 * values are recovered from the _removed_* orphan column after save.
 *
 * Rules tightened: creator can only mutate a race while not finished/cancelled;
 * deletion restricted to status = waiting.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('races')

    // ── Add new fields (idempotent) ─────────────────────────────────────────
    if (!collection.fields.getByName('mode')) {
      collection.fields.add(new Field({
        name: 'mode',
        type: 'text',
        required: false,
      }))
    }

    if (!collection.fields.getByName('target_duration_seconds')) {
      collection.fields.add(new Field({
        name: 'target_duration_seconds',
        type: 'number',
      }))
    }

    if (!collection.fields.getByName('ends_at')) {
      collection.fields.add(new Field({
        name: 'ends_at',
        type: 'date',
      }))
    }

    // ── Rename started_at -> starts_at + retype text -> date ───────────────
    const startsAtExists = collection.fields.getByName('starts_at')
    const startedAtField = collection.fields.getByName('started_at')
    if (!startsAtExists) {
      collection.fields.add(new Field({
        name: 'starts_at',
        type: 'date',
      }))
    }
    if (startedAtField) {
      // Keep around for data copy; removed after save via orphan column recovery
      collection.fields.removeByName('started_at')
    }

    // ── Retype finished_at: text -> date (idempotent) ───────────────────────
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
    collection.createRule = '@request.auth.id = creator'
    collection.updateRule = '@request.auth.id = creator && status != "finished" && status != "cancelled"'
    collection.deleteRule = '@request.auth.id = creator && status = "waiting"'

    // ── Indexes ─────────────────────────────────────────────────────────────
    const existingIndexes = collection.indexes || []
    if (!existingIndexes.some(idx => idx.includes('idx_races_status'))) {
      collection.indexes = [...existingIndexes, 'CREATE INDEX idx_races_status ON races (status)']
    }

    app.save(collection)

    // ── Post-save data backfill ─────────────────────────────────────────────
    // Default mode = 'distance' for existing rows (old schema only supported distance).
    try {
      app.db()
        .newQuery(`UPDATE races SET mode = 'distance' WHERE mode IS NULL OR mode = ''`)
        .execute()
    } catch (e) { /* ignore */ }

    // Recover starts_at from _removed_started_at_* orphan column
    try {
      const result = []
      app.db().newQuery('PRAGMA table_info(races)').all(result)
      const columns = result.map(r => r.name)
      const orphaned = columns.filter(c => c.startsWith('_removed_started_at'))
      for (const oldCol of orphaned) {
        app.db().newQuery(`
          UPDATE races
          SET starts_at = "${oldCol}"
          WHERE starts_at IS NULL AND "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
        `).execute()
      }
    } catch (e) { /* ignore */ }

    // Recover finished_at from _removed_finished_at_* orphan column
    try {
      const result = []
      app.db().newQuery('PRAGMA table_info(races)').all(result)
      const columns = result.map(r => r.name)
      const orphaned = columns.filter(c => c.startsWith('_removed_finished_at'))
      for (const oldCol of orphaned) {
        app.db().newQuery(`
          UPDATE races
          SET finished_at = "${oldCol}"
          WHERE finished_at IS NULL AND "${oldCol}" IS NOT NULL AND "${oldCol}" != ''
        `).execute()
      }
    } catch (e) { /* ignore */ }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('races')

    // Revert rules to permissive originals
    collection.listRule = '@request.auth.id != ""'
    collection.viewRule = '@request.auth.id != ""'
    collection.createRule = '@request.auth.id = creator'
    collection.updateRule = '@request.auth.id = creator'
    collection.deleteRule = '@request.auth.id = creator'

    collection.indexes = (collection.indexes || []).filter(idx => !idx.includes('idx_races_status'))

    // Drop new fields
    const mode = collection.fields.getByName('mode')
    if (mode) collection.fields.removeById(mode.id)
    const tds = collection.fields.getByName('target_duration_seconds')
    if (tds) collection.fields.removeById(tds.id)
    const endsAt = collection.fields.getByName('ends_at')
    if (endsAt) collection.fields.removeById(endsAt.id)
    const startsAt = collection.fields.getByName('starts_at')
    if (startsAt) collection.fields.removeById(startsAt.id)

    // Revert finished_at to text
    const finishedAt = collection.fields.getByName('finished_at')
    if (finishedAt) {
      collection.fields.removeById(finishedAt.id)
      collection.fields.add(new Field({ name: 'finished_at', type: 'text' }))
    }

    // Restore started_at as text
    if (!collection.fields.getByName('started_at')) {
      collection.fields.add(new Field({ name: 'started_at', type: 'text' }))
    }

    app.save(collection)
  },
)
