/// <reference path="../pb_data/types.d.ts" />

/**
 * Relax sets_log read rules for per-exercise challenge leaderboards.
 * Any authenticated user can read sets (needed to compute each participant's
 * best set of the challenge exercise inside the challenge window), mirroring
 * what 1774000035 already did for `sessions` and 1774000034 for `settings`.
 * Write rules remain owner-only.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sets_log")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sets_log")
  collection.listRule = "user = @request.auth.id"
  collection.viewRule = "user = @request.auth.id"
  app.save(collection)
})
