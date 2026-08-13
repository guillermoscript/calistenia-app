/// <reference path="../pb_data/types.d.ts" />

/**
 * Final standings on a closed battle (issue #398).
 *
 * A battle currently exists only while it is happening: once it closes, the result is
 * only reachable by rebuilding the standings from `battle_participants`, and a joiner
 * cannot do that — the participants read rule limits them to their own row, so they
 * would see a ranking of one. Every read of a past result therefore had to go through
 * the snapshot endpoint, one request per battle, which does not survive a history list.
 *
 * A closed battle is immutable, so the ranking is sealed onto the battle at the moment
 * it closes and read straight off the record afterwards. The names are frozen with it:
 * a result should read the way it read on the day, not follow later renames.
 *
 * Existing closed battles are left with `final_standings` empty. There is no honest way
 * to backfill one — the ranking depends on `finished_at` ordering that the sweep never
 * recorded for expired lobbies — and clients treat an empty value as "no result to
 * show" rather than as an empty ranking.
 */
migrate((app) => {
  const battles = app.findCollectionByNameOrId('battles')

  // Explicit field id, per the repo convention: a later type change must be able to
  // preserve it or PocketBase drops the column's data.
  const already = (battles.fields || []).some(f => f.name === 'final_standings')
  if (!already) {
    battles.fields.push(new Field({
      hidden: false,
      id: 'json_battle_final_standings',
      name: 'final_standings',
      presentable: false,
      required: false,
      system: false,
      type: 'json',
      maxSize: 0,
    }))
  }

  // The history list filters closed battles for one user and sorts them newest first.
  const historyIndex = 'CREATE INDEX idx_battles_status_finished ON battles (status, finished_at)'
  const indexes = (battles.indexes || []).slice()
  if (!indexes.some(idx => idx.includes('idx_battles_status_finished'))) {
    indexes.push(historyIndex)
    battles.indexes = indexes
  }

  app.save(battles)
}, (app) => {
  try {
    const battles = app.findCollectionByNameOrId('battles')
    battles.fields = battles.fields.filter(f => f.id !== 'json_battle_final_standings')
    battles.indexes = (battles.indexes || []).filter(
      idx => !idx.includes('idx_battles_status_finished'),
    )
    app.save(battles)
  } catch { /* collection already gone */ }
})
