/// <reference path="../pb_data/types.d.ts" />
/**
 * Relax user_stats read rules for leaderboard.
 * Any authenticated user can view stats (needed for rankings among friends).
 * Write rules remain owner-only.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000012")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000012")
  collection.listRule = "user = @request.auth.id"
  collection.viewRule = "user = @request.auth.id"
  app.save(collection)
})
