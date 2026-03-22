/// <reference path="../pb_data/types.d.ts" />

/**
 * Allow public read of user_stats for invite landing page social proof.
 * Stats (level, streak, sessions) are non-sensitive public profile data.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("user_stats")
  collection.listRule = ''
  collection.viewRule = ''
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_stats")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
})
