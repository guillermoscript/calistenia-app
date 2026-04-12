/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds discovery + activity fields to races:
 * - is_public (bool): opt-in to the public discover list
 * - origin_lat/lng (number): race start coords for bounding-box proximity
 * - activity_type (text): running/walking/cycling for save-as-workout fidelity
 *
 * Loosens listRule so unauthenticated visitors can see public races (for
 * discover / OG preview), while non-public ones stay authed-only.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('races')

    if (!col.fields.getByName('is_public')) {
      col.fields.add(new Field({ name: 'is_public', type: 'bool' }))
    }
    if (!col.fields.getByName('origin_lat')) {
      col.fields.add(new Field({ name: 'origin_lat', type: 'number' }))
    }
    if (!col.fields.getByName('origin_lng')) {
      col.fields.add(new Field({ name: 'origin_lng', type: 'number' }))
    }
    if (!col.fields.getByName('activity_type')) {
      col.fields.add(new Field({ name: 'activity_type', type: 'text' }))
    }

    // Public races visible to anyone (including bots for OG); private stays authed
    col.listRule = 'is_public = true || @request.auth.id != ""'
    col.viewRule = 'is_public = true || @request.auth.id != ""'

    const existingIndexes = col.indexes || []
    if (!existingIndexes.some(idx => idx.includes('idx_races_public'))) {
      col.indexes = [...existingIndexes, 'CREATE INDEX idx_races_public ON races (is_public, status)']
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('races')
    col.listRule = '@request.auth.id != ""'
    col.viewRule = '@request.auth.id != ""'
    col.indexes = (col.indexes || []).filter(idx => !idx.includes('idx_races_public'))

    for (const name of ['is_public', 'origin_lat', 'origin_lng', 'activity_type']) {
      const f = col.fields.getByName(name)
      if (f) col.fields.removeById(f.id)
    }
    app.save(col)
  },
)
