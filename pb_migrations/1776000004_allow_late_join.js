/// <reference path="../pb_data/types.d.ts" />

/**
 * Allow participants to join during countdown (not just while status='waiting').
 * Previously the createRule rejected joins once the creator triggered Start,
 * so any friend opening the link in the last 7s got a silent 400.
 *
 * Joining during 'active' is still blocked — the race has already started and
 * a late joiner can't be fairly ranked.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('race_participants')
    col.createRule = '@request.auth.id = user && (race.status = "waiting" || race.status = "countdown")'
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('race_participants')
    col.createRule = '@request.auth.id = user && race.status = "waiting"'
    app.save(col)
  },
)
