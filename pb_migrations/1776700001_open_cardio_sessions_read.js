/// <reference path="../pb_data/types.d.ts" />
/**
 * Open cardio_sessions read rules so any authenticated user can list/view
 * cardio sessions — required for the activity feed to show cardio items
 * from followed users. GPS route data is never exposed via the feed
 * (queries explicitly exclude the gps_points field).
 * Write rules remain owner-only (unchanged).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  collection.listRule = '@request.auth.id = user'
  collection.viewRule = '@request.auth.id = user'
  app.save(collection)
})
