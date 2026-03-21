/// <reference path="../pb_data/types.d.ts" />
/**
 * Relax sessions read rules for weekly leaderboard.
 * Any authenticated user can view sessions (needed to count weekly sessions per user).
 * Session data is not sensitive (just date + workout key).
 * Write rules remain owner-only.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sessions")
  collection.listRule = "user = @request.auth.id"
  collection.viewRule = "user = @request.auth.id"
  app.save(collection)
})
