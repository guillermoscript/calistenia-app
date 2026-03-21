/// <reference path="../pb_data/types.d.ts" />
/**
 * Relax settings read rules for leaderboard PR display.
 * Any authenticated user can view settings (needed for PR rankings).
 * Write rules remain owner-only.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings")
  collection.listRule = "user = @request.auth.id"
  collection.viewRule = "user = @request.auth.id"
  app.save(collection)
})
